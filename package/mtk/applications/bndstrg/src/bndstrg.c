/*
 * bndstrg - Band Steering Daemon for MediaTek mt_wifi driver
 *
 * Reverse-engineered from mt_wifi driver source (ap_band_steering.c)
 * Communicates with driver via wireless extensions events and ioctl.
 *
 * Protocol:
 *   Driver -> Daemon: IWEVCUSTOM events with OID_BNDSTRG_MSG (0x0950)
 *   Daemon -> Driver: ioctl RT_PRIV_IOCTL with subcmd OID_BNDSTRG_MSG | 0x8000
 *
 * Steering logic:
 *   - Clients that support VHT/HE (5GHz capable) with good RSSI are steered to 5GHz
 *   - Clients with weak signal or 2.4GHz-only are allowed on 2.4GHz
 *   - Uses CLI_ADD to whitelist clients on a band, allowing auth/probe
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include <errno.h>
#include <time.h>
#include <syslog.h>
#include <sys/socket.h>
#include <sys/ioctl.h>
#include <sys/types.h>
#include <linux/wireless.h>
#include <linux/if.h>
#include <linux/netlink.h>
#include <linux/rtnetlink.h>

/* ---- Driver protocol constants ---- */

#define OID_BNDSTRG_MSG         0x0950
#define OID_GET_SET_TOGGLE      0x8000
#define RT_PRIV_IOCTL           (SIOCIWFIRSTPRIV + 0x01)

#define BAND_5G                 1
#define BAND_24G                2

#define BND_STRG_MAX_TABLE_SIZE 64
#define MAC_ADDR_LEN            6

/* Frame types from driver */
/* Values from ap_band_steering.c local defines */
#define APMT2_PEER_PROBE_REQ       0
#define APMT2_PEER_DISASSOC_REQ    1
#define APMT2_PEER_ASSOC_REQ       2
#define APMT2_PEER_AUTH_REQ        3
/* Raw MsgType value for probe in AP sync FSM (driver sends this when
 * the local APMT2_PEER_PROBE_REQ define doesn't match Elem->MsgType) */
#define AP_SYNC_PEER_PROBE_REQ     4

/* Action codes */
enum {
	CLI_EVENT = 1,
	CLI_ADD,
	CLI_DEL,
	CLI_STATUS_REQ,
	CLI_STATUS_RSP,
	CHANLOAD_STATUS_REQ,
	CHANLOAD_STATUS_RSP,
	INF_STATUS_QUERY,
	INF_STATUS_RSP,
	TABLE_INFO,
	ENTRY_LIST,
	BNDSTRG_ONOFF,
	SET_MNT_ADDR,
	NVRAM_UPDATE,
	REJECT_EVENT,
	HEARTBEAT_MONITOR,
	BNDSTRG_WNM_BTM,
	BNDSTRG_PARAM,
	BNDSTRG_NEIGHBOR_REPORT,
	UPDATE_WHITE_BLACK_LIST,
};

/* Band steering states */
enum {
	BNDSTRG_STA_INIT = 0,
	BNDSTRG_STA_ASSOC,
	BNDSTRG_STA_DISASSOC,
};

/* Steering modes */
#define PRE_CONNECTION_STEERING  0x01
#define POST_CONNECTION_STEERING 0x02

/* ---- Message structures (matching driver exactly) ---- */

/* No packing — must match driver struct layout (natural alignment) */

struct bnd_msg_cli_probe {
	unsigned char bAllowStaConnectInHt;
	unsigned char bVHTCapable;
	unsigned char Nss;
	signed char Rssi[4];
};

struct bnd_msg_cli_auth {
	signed char Rssi[4];
};

struct bnd_msg_cli_assoc {
	unsigned char bAllowStaConnectInHt;
	unsigned char bVHTCapable;
	unsigned char Nss;
	unsigned char BTMSupport;
	unsigned char bWpsAssoc;
	unsigned char IfIndex;
};

struct bnd_msg_cli_delete {
};

struct bnd_msg_cli_event {
	unsigned char FrameType;
	unsigned char Band;
	unsigned char Channel;
	unsigned char Addr[MAC_ADDR_LEN];
	union {
		struct bnd_msg_cli_probe cli_probe;
		struct bnd_msg_cli_auth cli_auth;
		struct bnd_msg_cli_assoc cli_assoc;
		struct bnd_msg_cli_delete cli_delete;
	} data;
};

struct bnd_msg_cli_add {
	unsigned char TableIndex;
	unsigned char Addr[MAC_ADDR_LEN];
};

struct bnd_msg_cli_del {
	unsigned char TableIndex;
	unsigned char Addr[MAC_ADDR_LEN];
};

struct bnd_msg_inf_status_rsp {
	unsigned char bInfReady;
	unsigned char Idx;
	unsigned char Channel;
	unsigned char bVHTCapable;
	unsigned long table_src_addr;
	char ucIfName[32];
	unsigned char nvram_support;
	unsigned char nss;
	unsigned char band;
	unsigned int table_size;
};

struct bnd_msg_onoff {
	unsigned char Band;
	unsigned char Channel;
	unsigned char OnOff;
	unsigned char BndStrgMode;
	char ucIfName[32];
};

struct bnd_msg_heartbeat {
	char ucIfName[32];
};

struct bnd_msg_cli_status_rsp {
	unsigned char TableIndex;
	unsigned char ReturnCode;
	unsigned char Addr[MAC_ADDR_LEN];
	char data_Rssi;
	unsigned int data_tx_Rate;
	unsigned int data_rx_Rate;
	unsigned long long data_tx_Byte;
	unsigned long long data_rx_Byte;
	unsigned char data_tx_Phymode;
	unsigned char data_rx_Phymode;
	unsigned char data_tx_mcs;
	unsigned char data_rx_mcs;
	unsigned char data_tx_bw;
	unsigned char data_rx_bw;
	unsigned char data_tx_sgi;
	unsigned char data_rx_sgi;
	unsigned char data_tx_stbc;
	unsigned char data_rx_stbc;
	unsigned char data_tx_ant;
	unsigned char data_rx_ant;
	unsigned long long data_tx_packets;
	unsigned long long data_rx_packets;
};

struct bnd_msg_param {
	unsigned char Band;
	unsigned char Channel;
	unsigned char len;
	char arg[64];
};

struct bnd_msg_neighbor_report {
	unsigned char Addr[MAC_ADDR_LEN];
	unsigned char Band;
	unsigned char Channel;
	char NeighborRepInfo[64];
};

struct bnd_msg_mnt_addr {
	unsigned char Addr[MAC_ADDR_LEN];
};

struct bnd_msg_nvram_entry_update {
	unsigned char Addr[MAC_ADDR_LEN];
	/* simplified nvram_entry */
	unsigned char nvram_data[16];
};

struct bnd_msg_reject_body {
	unsigned int DaemonPid;
};

struct bnd_msg_display_entry_list {
	unsigned int display_type;
	unsigned char filer_band;
	unsigned char channel;
};

struct bnd_msg_update_white_black_list {
	char ucIfName[32];
	unsigned char list_type;
	unsigned char Addr[MAC_ADDR_LEN];
	unsigned char deladd;
};

struct bnd_msg_wnm_command {
	unsigned char wnm_data[64];
};

typedef struct {
	unsigned char Action;
	union {
		struct bnd_msg_cli_event cli_event;
		struct bnd_msg_cli_add cli_add;
		struct bnd_msg_cli_del cli_del;
		struct bnd_msg_cli_status_rsp cli_status_rsp;
		struct bnd_msg_inf_status_rsp inf_status_rsp;
		struct bnd_msg_onoff onoff;
		struct bnd_msg_heartbeat heartbeat;
		struct bnd_msg_mnt_addr mnt_addr;
		struct bnd_msg_nvram_entry_update entry_update;
		struct bnd_msg_reject_body reject_body;
		struct bnd_msg_display_entry_list display_type;
		struct bnd_msg_param bndstrg_param;
		struct bnd_msg_update_white_black_list update_white_black_list;
		struct bnd_msg_wnm_command wnm_cmd_data;
		struct bnd_msg_neighbor_report Neighbor_Report;
	} data;
} BNDSTRG_MSG;

/* End of message structures */

/* ---- Client tracking ---- */

#define MAX_CLIENTS 128
#define RSSI_THRESHOLD -65     /* dBm: below this, allow 2.4GHz */
#define STEER_TIMEOUT  30      /* seconds: how long to block 2.4GHz */

struct client_entry {
	unsigned char addr[MAC_ADDR_LEN];
	unsigned char valid;
	unsigned char vht_capable;
	unsigned char nss;
	unsigned char band;          /* band where client is associated */
	unsigned char state;
	signed char best_rssi;
	time_t first_seen;
	time_t last_seen;
	unsigned char steered;       /* 1 = we steered this client to 5GHz */
	unsigned char added_2g;      /* 1 = CLI_ADD sent for 2.4GHz */
	unsigned char added_5g;      /* 1 = CLI_ADD sent for 5GHz */
};

static struct client_entry clients[MAX_CLIENTS];
static volatile int running = 1;

/* Interface state — supports multiple BSSIDs per band */
#define MAX_IFACES 8
static struct {
	char ifname[32];
	unsigned char band;
	unsigned char channel;
	unsigned char ready;
	unsigned char vht_capable;
} ifaces[MAX_IFACES];
static int num_ifaces = 0;

#define MACFMT "%02x:%02x:%02x:%02x:%02x:%02x"
#define MACARG(a) (a)[0],(a)[1],(a)[2],(a)[3],(a)[4],(a)[5]

/* ---- Helper functions ---- */

static struct client_entry *find_client(const unsigned char *addr)
{
	for (int i = 0; i < MAX_CLIENTS; i++) {
		if (clients[i].valid &&
		    memcmp(clients[i].addr, addr, MAC_ADDR_LEN) == 0)
			return &clients[i];
	}
	return NULL;
}

static struct client_entry *add_client(const unsigned char *addr)
{
	struct client_entry *c = find_client(addr);
	if (c) return c;

	for (int i = 0; i < MAX_CLIENTS; i++) {
		if (!clients[i].valid) {
			memset(&clients[i], 0, sizeof(clients[i]));
			memcpy(clients[i].addr, addr, MAC_ADDR_LEN);
			clients[i].valid = 1;
			clients[i].first_seen = time(NULL);
			return &clients[i];
		}
	}

	/* table full, evict oldest non-associated client */
	time_t oldest = time(NULL);
	int oldest_idx = -1;
	for (int i = 0; i < MAX_CLIENTS; i++) {
		if (clients[i].state == BNDSTRG_STA_ASSOC)
			continue; /* never evict associated clients */
		if (clients[i].last_seen < oldest) {
			oldest = clients[i].last_seen;
			oldest_idx = i;
		}
	}
	if (oldest_idx < 0) {
		/* all slots are associated clients, evict absolute oldest */
		for (int i = 0; i < MAX_CLIENTS; i++) {
			if (clients[i].last_seen < oldest || oldest_idx < 0) {
				oldest = clients[i].last_seen;
				oldest_idx = i;
			}
		}
	}
	memset(&clients[oldest_idx], 0, sizeof(clients[oldest_idx]));
	memcpy(clients[oldest_idx].addr, addr, MAC_ADDR_LEN);
	clients[oldest_idx].valid = 1;
	clients[oldest_idx].first_seen = time(NULL);
	return &clients[oldest_idx];
}

static signed char best_rssi(const signed char *rssi, int count)
{
	signed char best = -128;
	for (int i = 0; i < count && i < 4; i++) {
		if (rssi[i] != (signed char)0x80 && rssi[i] > best)
			best = rssi[i];
	}
	return best;
}

/* ---- Driver communication ---- */

static int send_msg_to_driver(const char *ifname, BNDSTRG_MSG *msg)
{
	int fd;
	struct iwreq wrq;

	fd = socket(AF_INET, SOCK_DGRAM, 0);
	if (fd < 0) {
		syslog(LOG_ERR, "socket: %s", strerror(errno));
		return -1;
	}

	memset(&wrq, 0, sizeof(wrq));
	strncpy(wrq.ifr_name, ifname, IFNAMSIZ - 1);
	wrq.u.data.pointer = msg;
	wrq.u.data.length = sizeof(BNDSTRG_MSG);
	wrq.u.data.flags = OID_BNDSTRG_MSG | OID_GET_SET_TOGGLE;

	if (ioctl(fd, RT_PRIV_IOCTL, &wrq) < 0) {
		syslog(LOG_ERR, "ioctl %s: %s", ifname, strerror(errno));
		close(fd);
		return -1;
	}

	close(fd);
	return 0;
}

static int send_cli_add(const char *ifname, const unsigned char *addr, unsigned char table_idx)
{
	BNDSTRG_MSG msg;
	memset(&msg, 0, sizeof(msg));
	msg.Action = CLI_ADD;
	msg.data.cli_add.TableIndex = table_idx;
	memcpy(msg.data.cli_add.Addr, addr, MAC_ADDR_LEN);

	syslog(LOG_DEBUG, "cli_add " MACFMT " -> %s",
	       MACARG(addr), ifname);

	return send_msg_to_driver(ifname, &msg);
}

static int send_cli_del(const char *ifname, const unsigned char *addr, unsigned char table_idx)
{
	BNDSTRG_MSG msg;
	memset(&msg, 0, sizeof(msg));
	msg.Action = CLI_DEL;
	msg.data.cli_del.TableIndex = table_idx;
	memcpy(msg.data.cli_del.Addr, addr, MAC_ADDR_LEN);

	syslog(LOG_DEBUG, "cli_del " MACFMT " -> %s",
	       MACARG(addr), ifname);

	return send_msg_to_driver(ifname, &msg);
}

static int send_onoff(const char *ifname, unsigned char onoff, unsigned char band,
                      unsigned char channel, unsigned char mode)
{
	BNDSTRG_MSG msg;
	memset(&msg, 0, sizeof(msg));
	msg.Action = BNDSTRG_ONOFF;
	msg.data.onoff.OnOff = onoff;
	msg.data.onoff.Band = band;
	msg.data.onoff.Channel = channel;
	msg.data.onoff.BndStrgMode = mode;
	strncpy(msg.data.onoff.ucIfName, ifname, sizeof(msg.data.onoff.ucIfName) - 1);

	syslog(LOG_DEBUG, "onoff %s band=%d ch=%d mode=%d",
	       onoff ? "on" : "off", band, channel, mode);

	return send_msg_to_driver(ifname, &msg);
}

static int send_heartbeat(const char *ifname)
{
	BNDSTRG_MSG msg;
	memset(&msg, 0, sizeof(msg));
	msg.Action = HEARTBEAT_MONITOR;
	strncpy(msg.data.heartbeat.ucIfName, ifname, sizeof(msg.data.heartbeat.ucIfName) - 1);
	return send_msg_to_driver(ifname, &msg);
}

static int send_inf_status_query(const char *ifname)
{
	BNDSTRG_MSG msg;
	memset(&msg, 0, sizeof(msg));
	msg.Action = INF_STATUS_QUERY;
	strncpy(msg.data.inf_status_rsp.ucIfName, ifname,
	        sizeof(msg.data.inf_status_rsp.ucIfName) - 1);

	syslog(LOG_DEBUG, "query %s", ifname);
	return send_msg_to_driver(ifname, &msg);
}

/* ---- Steering decision logic ---- */

/*
 * Decide whether to allow a client on a given band.
 * Returns: 1 = allow (send CLI_ADD), 0 = block (don't add, driver rejects)
 */
static int should_allow_on_band(struct client_entry *c, unsigned char band, signed char rssi)
{
	/* Always allow on 5GHz */
	if (band == BAND_5G)
		return 1;

	/* 2.4GHz: block VHT-capable clients with good signal (steer to 5GHz) */
	if (c->vht_capable && rssi > RSSI_THRESHOLD) {
		/* Good signal + VHT capable = force to 5GHz */
		time_t now = time(NULL);
		if (now - c->first_seen < STEER_TIMEOUT) {
			/* Still within steering window, block 2.4GHz */
			return 0;
		}
		/* Timeout expired, client couldn't connect to 5GHz, allow 2.4GHz */
		syslog(LOG_DEBUG, MACFMT " steer timeout, allowing 2.4GHz",
		       MACARG(c->addr));
		return 1;
	}

	/* Weak signal or non-VHT: allow 2.4GHz */
	return 1;
}

/*
 * Post-connection steering: if a VHT client is on 2.4GHz with good signal,
 * kick it so it reconnects on 5GHz.
 */
#define RSSI_LOW_THRESHOLD -75  /* dBm: below this on 5GHz, steer to 2.4GHz */

static void check_post_steering(void)
{
	const char *ifname_2g = NULL, *ifname_5g = NULL;

	for (int i = 0; i < num_ifaces; i++) {
		if (ifaces[i].band == BAND_24G && ifaces[i].ready)
			ifname_2g = ifaces[i].ifname;
		else if (ifaces[i].band == BAND_5G && ifaces[i].ready)
			ifname_5g = ifaces[i].ifname;
	}

	for (int i = 0; i < MAX_CLIENTS; i++) {
		struct client_entry *c = &clients[i];
		if (!c->valid || c->state != BNDSTRG_STA_ASSOC)
			continue;

		/* VHT client on 2.4GHz with good signal -> steer to 5GHz */
		if (c->band == BAND_24G && c->vht_capable &&
		    c->best_rssi > RSSI_THRESHOLD && ifname_2g) {
			syslog(LOG_NOTICE, MACFMT " steering 2.4GHz -> 5GHz (rssi=%d)",
			       MACARG(c->addr), c->best_rssi);
			send_cli_del(ifname_2g, c->addr, 0);
			c->state = BNDSTRG_STA_INIT;
			c->band = 0;
			c->added_2g = 0;
			c->added_5g = 0;
			c->first_seen = time(NULL);
		}

		/* Client on 5GHz with weak signal -> steer to 2.4GHz */
		if (c->band == BAND_5G && c->best_rssi < RSSI_LOW_THRESHOLD &&
		    c->best_rssi != 0 && ifname_5g) {
			syslog(LOG_NOTICE, MACFMT " steering 5GHz -> 2.4GHz (rssi=%d)",
			       MACARG(c->addr), c->best_rssi);
			send_cli_del(ifname_5g, c->addr, 0);
			c->state = BNDSTRG_STA_INIT;
			c->band = 0;
			c->added_2g = 0;
			c->added_5g = 0;
			c->first_seen = time(NULL);
		}
	}
}

/* ---- Event processing ---- */

static void handle_cli_event(const BNDSTRG_MSG *msg, const char *src_ifname)
{
	const struct bnd_msg_cli_event *ev = &msg->data.cli_event;
	struct client_entry *c;
	signed char rssi;
	const char *ifname_2g = NULL, *ifname_5g = NULL;

	/* Find interface names */
	for (int i = 0; i < num_ifaces; i++) {
		if (ifaces[i].band == BAND_24G)
			ifname_2g = ifaces[i].ifname;
		else if (ifaces[i].band == BAND_5G)
			ifname_5g = ifaces[i].ifname;
	}

	switch (ev->FrameType) {
	case AP_SYNC_PEER_PROBE_REQ: /* raw MsgType from driver */
	case APMT2_PEER_PROBE_REQ: {
		/* Update RSSI for already-tracked clients, ignore neighbors */
		c = find_client(ev->Addr);
		if (c) {
			const struct bnd_msg_cli_probe *probe = &ev->data.cli_probe;
			c->best_rssi = best_rssi(probe->Rssi, 4);
			c->last_seen = time(NULL);
			if (probe->bVHTCapable)
				c->vht_capable = 1;
		}
		break;
	}

	case APMT2_PEER_AUTH_REQ: {
		const struct bnd_msg_cli_auth *auth = &ev->data.cli_auth;
		c = add_client(ev->Addr);
		rssi = best_rssi(auth->Rssi, 4);
		c->best_rssi = rssi;
		c->last_seen = time(NULL);

		syslog(LOG_DEBUG, "auth " MACFMT " %s rssi=%d",
		       MACARG(ev->Addr),
		       ev->Band == BAND_5G ? "5G" : "2.4G", rssi);

		/* In POST_CONNECTION mode, driver allows all auth without CLI_ADD.
		 * Just track the client, no need to add to driver table. */
		break;
	}

	case APMT2_PEER_ASSOC_REQ: {
		const struct bnd_msg_cli_assoc *assoc = &ev->data.cli_assoc;
		c = add_client(ev->Addr);
		c->last_seen = time(NULL);

		if (assoc->bVHTCapable)
			c->vht_capable = 1;
		if (assoc->Nss > c->nss)
			c->nss = assoc->Nss;
		c->band = ev->Band;
		c->state = BNDSTRG_STA_ASSOC;

		syslog(LOG_NOTICE, MACFMT " connected on %s (vht=%d nss=%d)",
		       MACARG(ev->Addr),
		       ev->Band == BAND_5G ? "5GHz" : "2.4GHz",
		       assoc->bVHTCapable, assoc->Nss);

		/* Add to driver table only on association — keeps table small */
		if (ev->Band == BAND_5G && ifname_5g)
			send_cli_add(ifname_5g, ev->Addr, 0);
		else if (ev->Band == BAND_24G && ifname_2g)
			send_cli_add(ifname_2g, ev->Addr, 0);
		break;
	}

	case APMT2_PEER_DISASSOC_REQ:
		c = find_client(ev->Addr);
		if (!c) break;

		syslog(LOG_NOTICE, MACFMT " disconnected from %s",
		       MACARG(ev->Addr),
		       ev->Band == BAND_5G ? "5GHz" : "2.4GHz");

		c->state = BNDSTRG_STA_DISASSOC;
		c->band = 0;
		/* Reset steering state so client can be re-evaluated */
		c->added_2g = 0;
		c->added_5g = 0;
		c->steered = 0;
		c->first_seen = time(NULL);
		break;
	}
}

static void handle_inf_status(const BNDSTRG_MSG *msg)
{
	const struct bnd_msg_inf_status_rsp *inf = &msg->data.inf_status_rsp;

	/* Driver may return empty ucIfName on query — derive from band */
	const char *name = inf->ucIfName;
	if (!name[0]) {
		if (inf->band == BAND_24G) name = "ra0";
		else if (inf->band == BAND_5G) name = "rax0";
	}

	syslog(LOG_DEBUG, "iface %s %s ch=%d vht=%d nss=%d ready=%d",
	       name,
	       inf->band == BAND_5G ? "5G" : "2.4G",
	       inf->Channel, inf->bVHTCapable, inf->nss, inf->bInfReady);

	/* Update existing or add new interface */
	int found = -1;
	for (int i = 0; i < num_ifaces; i++) {
		if (strcmp(ifaces[i].ifname, name) == 0) {
			found = i;
			break;
		}
	}
	if (found < 0 && num_ifaces < MAX_IFACES) {
		found = num_ifaces++;
		strncpy(ifaces[found].ifname, name, sizeof(ifaces[found].ifname) - 1);
	}
	if (found >= 0) {
		ifaces[found].band = inf->band;
		if (inf->Channel)
			ifaces[found].channel = inf->Channel;
		ifaces[found].ready = inf->bInfReady;
		ifaces[found].vht_capable = inf->bVHTCapable;
	}

	/* When both interfaces are ready, enable band steering (once).
	 * Send all ONOFF commands via each interface's own ioctl.
	 * The driver patch does late-init of the table in BndStrg_MsgHandle
	 * if the channel is now assigned. */
	static int bs_enabled = 0;
	int has_2g = 0, has_5g = 0;
	for (int i = 0; i < num_ifaces; i++) {
		if (ifaces[i].ready && ifaces[i].band == BAND_24G) has_2g = 1;
		if (ifaces[i].ready && ifaces[i].band == BAND_5G) has_5g = 1;
	}
	if (!bs_enabled && has_2g && has_5g) {
		syslog(LOG_NOTICE, "band steering enabled (2.4GHz + 5GHz)");
		for (int i = 0; i < num_ifaces; i++) {
			send_onoff(ifaces[i].ifname, 1, ifaces[i].band,
			           ifaces[i].channel, POST_CONNECTION_STEERING);
		}
		bs_enabled = 1;
	}
}

static void handle_onoff(const BNDSTRG_MSG *msg)
{
	const struct bnd_msg_onoff *onoff = &msg->data.onoff;
	syslog(LOG_DEBUG, "driver confirmed %s %s ch=%d",
	       onoff->OnOff ? "on" : "off",
	       onoff->Band == BAND_5G ? "5GHz" : "2.4GHz",
	       onoff->Channel);
}

static void process_driver_msg(const BNDSTRG_MSG *msg, const char *src_ifname)
{
	switch (msg->Action) {
	case CLI_EVENT:
		handle_cli_event(msg, src_ifname);
		break;
	case INF_STATUS_RSP:
		handle_inf_status(msg);
		break;
	case BNDSTRG_ONOFF:
		handle_onoff(msg);
		break;
	case REJECT_EVENT:
		/* Stale PID from previous instance — clears after ONOFF updates it */
		syslog(LOG_DEBUG, "stale daemon pid=%u, will clear on next onoff",
		       msg->data.reject_body.DaemonPid);
		break;
	case HEARTBEAT_MONITOR:
		break;
	case BNDSTRG_NEIGHBOR_REPORT:
		/* Neighbor report from driver — informational, no action needed */
		break;
	default:
		syslog(LOG_DEBUG, "Unknown action: %d", msg->Action);
		break;
	}
}

/* ---- Netlink event listener ---- */

/* Wait for at least one ra* interface to appear */
static int wait_for_interfaces(void)
{
	int attempts = 0;
	while (running && attempts < 120) {
		if (access("/sys/class/net/ra0", F_OK) == 0) {
			syslog(LOG_DEBUG, "ra0 detected, waiting for driver");
			/* Give driver time to send INF_STATUS_RSP events */
			sleep(5);
			return 0;
		}
		sleep(1);
		attempts++;
	}
	syslog(LOG_ERR, "Timeout waiting for interfaces");
	return -1;
}

/* Open netlink socket for wireless extension events (IFLA_WIRELESS in RTM_NEWLINK) */
static int open_wext_event_socket(void)
{
	int fd;
	struct sockaddr_nl addr;

	fd = socket(AF_NETLINK, SOCK_RAW, NETLINK_ROUTE);
	if (fd < 0) {
		syslog(LOG_ERR, "wext event socket: %s", strerror(errno));
		return -1;
	}

	memset(&addr, 0, sizeof(addr));
	addr.nl_family = AF_NETLINK;
	addr.nl_groups = RTMGRP_LINK;

	if (bind(fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
		syslog(LOG_ERR, "wext bind: %s", strerror(errno));
		close(fd);
		return -1;
	}

	return fd;
}

/* Parse wireless events from netlink IFLA_WIRELESS attribute.
 *
 * Layout of iw_event in netlink stream (different from userspace struct!):
 *   - __u16 len     (total event length including header)
 *   - __u16 cmd     (IWEVCUSTOM = 0x8C02)
 *   - For IWEVCUSTOM with IW_EV_POINT:
 *     - struct iw_point header (pointer is unused in netlink, just length+flags)
 *     - custom data follows inline
 *
 * On aarch64: IW_EV_POINT_OFF = 16 bytes (len+cmd+padding+iw_point)
 * Custom data starts at offset IW_EV_POINT_OFF from iw_event start.
 *
 * The MTK driver sends: flags=OID_BNDSTRG_MSG, custom data=BNDSTRG_MSG struct.
 */
static void parse_wext_event(const char *data, int len, const char *ifname)
{
	int offset = 0;

	while (offset + 4 <= len) {
		unsigned short ev_len, ev_cmd;
		memcpy(&ev_len, data + offset, 2);
		memcpy(&ev_cmd, data + offset + 2, 2);

		if (ev_len < 4 || ev_len > len - offset)
			break;

		if (ev_cmd == IWEVCUSTOM) {
			/* iw_point: pointer(8 on 64-bit), length(2), flags(2) */
			/* In netlink stream, the pointer is not transmitted.
			 * Format is: len(2) + cmd(2) + pad(4) + length(2) + flags(2) + pad(4) + data
			 * But actually the kernel uses IW_EV_POINT_LEN which varies.
			 * Safest: scan for OID_BNDSTRG_MSG (0x0950) in flags field */

			/* iw_event netlink layout on aarch64:
			 *   0-1: len, 2-3: cmd, 4-7: pad
			 *   8-9: iw_point.length, 10-11: iw_point.flags
			 *   12-15: pad, 16+: custom data (BNDSTRG_MSG) */
			if (ev_len >= 16) {
				unsigned short flags;
				memcpy(&flags, data + offset + 10, 2);

				if (flags == OID_BNDSTRG_MSG) {
					/* BNDSTRG_MSG starts after the iw_event header (16 bytes) */
					int msg_offset = 16;
					int msg_len = ev_len - msg_offset;

					if (msg_len >= (int)sizeof(BNDSTRG_MSG)) {
						BNDSTRG_MSG msg_buf;
						memcpy(&msg_buf, data + offset + msg_offset, sizeof(BNDSTRG_MSG));
						process_driver_msg(&msg_buf, ifname);
					}
				}
			}
		}

		offset += ev_len;
	}
}

/* ---- Main event loop ---- */

static void handle_signal(int sig)
{
	(void)sig;
	running = 0;
}

/* Heartbeat timer: send periodic heartbeats to driver */
static time_t last_heartbeat = 0;
#define HEARTBEAT_INTERVAL 10

static void send_heartbeats(void)
{
	time_t now = time(NULL);
	if (now - last_heartbeat < HEARTBEAT_INTERVAL)
		return;
	last_heartbeat = now;

	for (int i = 0; i < num_ifaces; i++) {
		if (ifaces[i].ready)
			send_heartbeat(ifaces[i].ifname);
	}
}

/* Periodically clean stale client entries */
static void cleanup_clients(void)
{
	time_t now = time(NULL);
	for (int i = 0; i < MAX_CLIENTS; i++) {
		if (clients[i].valid && clients[i].state != BNDSTRG_STA_ASSOC &&
		    now - clients[i].last_seen > 300) {
			syslog(LOG_DEBUG, "Expiring client " MACFMT,
			       MACARG(clients[i].addr));
			memset(&clients[i], 0, sizeof(clients[i]));
		}
	}
}

int main(int argc, char *argv[])
{
	int nl_fd;
	char buf[8192];
	fd_set rfds;
	struct timeval tv;
	time_t last_cleanup = 0;

	(void)argc;
	(void)argv;

	openlog("bndstrg", LOG_PID | LOG_CONS, LOG_DAEMON);
	syslog(LOG_NOTICE, "starting");

	signal(SIGINT, handle_signal);
	signal(SIGTERM, handle_signal);

	memset(clients, 0, sizeof(clients));
	memset(ifaces, 0, sizeof(ifaces));

	/* Open netlink socket for wireless events FIRST so we don't miss any */
	nl_fd = open_wext_event_socket();
	if (nl_fd < 0)
		return 1;

	/* Wait for WiFi interfaces */
	if (wait_for_interfaces() < 0) {
		close(nl_fd);
		return 1;
	}

	syslog(LOG_DEBUG, "querying interfaces");

	/* Query all ra and rax interfaces for INF_STATUS_RSP */
	{
		char ifbuf[16];
		for (int i = 0; i < 4; i++) {
			snprintf(ifbuf, sizeof(ifbuf), "ra%d", i);
			if (access("/sys/class/net/", F_OK) == 0) {
				char path[64];
				snprintf(path, sizeof(path), "/sys/class/net/%s", ifbuf);
				if (access(path, F_OK) == 0)
					send_inf_status_query(ifbuf);
			}
			snprintf(ifbuf, sizeof(ifbuf), "rax%d", i);
			{
				char path[64];
				snprintf(path, sizeof(path), "/sys/class/net/%s", ifbuf);
				if (access(path, F_OK) == 0)
					send_inf_status_query(ifbuf);
			}
		}
	}

	syslog(LOG_DEBUG, "listening for events");

	/* Main event loop */
	while (running) {
		FD_ZERO(&rfds);
		FD_SET(nl_fd, &rfds);
		tv.tv_sec = 5;
		tv.tv_usec = 0;

		int ret = select(nl_fd + 1, &rfds, NULL, NULL, &tv);
		if (ret < 0) {
			if (errno == EINTR) continue;
			syslog(LOG_ERR, "select: %s", strerror(errno));
			break;
		}

		if (ret > 0 && FD_ISSET(nl_fd, &rfds)) {
			struct nlmsghdr *nlh;
			int n = recv(nl_fd, buf, sizeof(buf), 0);
			if (n <= 0) continue;

			for (nlh = (struct nlmsghdr *)buf;
			     NLMSG_OK(nlh, (unsigned int)n);
			     nlh = NLMSG_NEXT(nlh, n)) {

				if (nlh->nlmsg_type == RTM_NEWLINK ||
				    nlh->nlmsg_type == RTM_DELLINK) {
					struct ifinfomsg *ifi = NLMSG_DATA(nlh);
					struct rtattr *rta = IFLA_RTA(ifi);
					int rtalen = IFLA_PAYLOAD(nlh);
					char ifname[IFNAMSIZ] = "";

					/* Extract interface name */
					while (RTA_OK(rta, rtalen)) {
						if (rta->rta_type == IFLA_IFNAME) {
							strncpy(ifname, RTA_DATA(rta), IFNAMSIZ - 1);
						}
						if (rta->rta_type == IFLA_WIRELESS) {
							/* Wireless extension event */
							parse_wext_event(RTA_DATA(rta),
							                 RTA_PAYLOAD(rta), ifname);
						}
						rta = RTA_NEXT(rta, rtalen);
					}
				}
			}
		}

		/* Periodic tasks */
		send_heartbeats();

		time_t now = time(NULL);
		if (now - last_cleanup > 5) {
			cleanup_clients();
			check_post_steering();
			last_cleanup = now;

			/* ch=0 on 2.4GHz is a driver limitation with channel=auto,
			 * does not affect band steering operation. No retry needed. */
		}
	}

	syslog(LOG_NOTICE, "stopping");

	/* Disable band steering on exit */
	for (int i = 0; i < num_ifaces; i++) {
		if (ifaces[i].ready) {
			send_onoff(ifaces[i].ifname, 0, ifaces[i].band,
			           ifaces[i].channel, 0);
		}
	}

	close(nl_fd);
	closelog();
	return 0;
}
