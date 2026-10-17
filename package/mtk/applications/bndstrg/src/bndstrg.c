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
 * The driver runs in POST_CONNECTION_STEERING mode: it lets every client
 * connect and reports probes, auths, associations and disconnections. The
 * daemon watches the signal of each associated client (CLI_STATUS_REQ) and
 * of its probes on the other band, and moves it when that is clearly better:
 *
 *   - a dual-band client on 2.4 GHz whose 5 GHz signal is good goes to 5 GHz
 *   - a client on 5 GHz whose signal is weak goes to 2.4 GHz
 *
 * A move blacklists the client on the band it leaves for a few seconds (the
 * driver then answers neither its probes nor its auth there) and
 * disconnects it, so it has to come back on the other band. A condition has
 * to hold for several checks in a row, busy clients are left alone, and a
 * client that comes straight back to the band it was moved away from is
 * left alone for longer each time, so no client is kicked in a loop.
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
#define RTPRIV_IOCTL_SET        (SIOCIWFIRSTPRIV + 0x02)

#define BAND_5G                 1
#define BAND_24G                2

#define MAC_ADDR_LEN            6

/* Frame types of CLI_EVENT, as the driver sends them */
#define APMT2_PEER_PROBE_REQ       0
#define APMT2_PEER_DISASSOC_REQ    1
#define APMT2_PEER_ASSOC_REQ       2
#define APMT2_PEER_AUTH_REQ        3
/* Drivers without the frame type fix send the MLME message id instead */
#define SYNC_FSM_PEER_PROBE_REQ    4
#define AUTH_FSM_PEER_AUTH_REQ     6

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

/* Client states */
enum {
	BNDSTRG_STA_INIT = 0,
	BNDSTRG_STA_ASSOC,
	BNDSTRG_STA_DISASSOC,
};

/* Steering modes */
#define PRE_CONNECTION_STEERING  0x01
#define POST_CONNECTION_STEERING 0x02

/* White/black list types */
#define BNDSTRG_WHITELIST 1
#define BNDSTRG_BLACKLIST 2

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

/* The driver rejects any message longer than its own BNDSTRG_MSG (80 bytes
 * on aarch64). Catch a layout change at build time. */
_Static_assert(sizeof(BNDSTRG_MSG) == 80, "BNDSTRG_MSG must match the driver");

/* End of message structures */

/* ---- Tunables (command line) ---- */

static int opt_rssi_up = -70;       /* dBm on 5 GHz needed to move up */
static int opt_rssi_down = -80;     /* dBm on 5 GHz below which to move down */
static int opt_block_time = 15;     /* s the old band ignores a moved client */
static int opt_cooldown = 120;      /* s between two moves of one client */
static int opt_busy_pps = 50;       /* packets/s above which a client is busy */
static int opt_verbose = 0;

#define CHECK_INTERVAL     5   /* s between steering checks and status polls */
#define HEARTBEAT_INTERVAL 10  /* s; the driver gives up after 100 s */
#define HOLD_CHECKS        3   /* checks in a row a condition must hold */
#define SETTLE_TIME        20  /* s after association before any move */
#define RESULT_WINDOW      90  /* s after a move to judge where it landed */
#define SEEN_WINDOW        600 /* s a sighting on a band counts as capability */
#define PROBE_RSSI_AGE     60  /* s a probe RSSI on the other band stays valid */
#define DATA_RSSI_AGE      15  /* s a data RSSI stays valid */
#define BAND_2G_PENALTY    10  /* dB a 5 GHz link is estimated weaker than 2.4 */
#define MAX_FAILS          4   /* failed moves before the backoff stops growing */
#define CLIENT_EXPIRY      300 /* s an unassociated client is remembered */

/* ---- Client tracking ---- */

#define MAX_CLIENTS 128

/* index into the per-band arrays */
#define B2G 0
#define B5G 1
#define BIDX(band) ((band) == BAND_5G ? B5G : B2G)
#define BNAME(band) ((band) == BAND_5G ? "5GHz" : "2.4GHz")

struct client_entry {
	unsigned char addr[MAC_ADDR_LEN];
	unsigned char valid;
	unsigned char vht_capable;
	unsigned char nss;
	unsigned char band;          /* band where client is associated, 0 if not */
	unsigned char state;
	time_t last_seen;
	time_t assoc_time;

	/* signal per band: probes and auths, or data frames when associated */
	signed char rssi[2];
	time_t rssi_time[2];
	time_t seen[2];              /* last frame of any kind on the band */

	/* traffic, from CLI_STATUS_RSP */
	unsigned long long pkts;
	time_t pkts_time;
	unsigned int pps;

	/* steering */
	unsigned char hold;          /* consecutive checks the move condition held */
	unsigned char blocked_band;  /* band the client is blacklisted on, 0 if none */
	time_t block_until;
	unsigned char steer_to;      /* band the last move aimed at, 0 if judged */
	time_t steer_time;
	unsigned char fails;
	time_t cooldown_until;
};

static struct client_entry clients[MAX_CLIENTS];
static volatile int running = 1;
static int ioctl_fd = -1;

/* Interface state — supports multiple BSSIDs per band */
#define MAX_IFACES 8
static struct {
	char ifname[32];          /* the driver reports names in 32 bytes */
	unsigned char band;
	unsigned char channel;
	unsigned char ready;
	unsigned char vht_capable;
} ifaces[MAX_IFACES];
static int num_ifaces = 0;

/* Band steering state per band, as last confirmed by the driver */
static struct {
	unsigned char enabled;
	time_t enable_time;
} bands[2];

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

static void unblock_client(struct client_entry *c);
static void query_interfaces(void);

static struct client_entry *add_client(const unsigned char *addr)
{
	struct client_entry *c = find_client(addr);
	int idx = -1;

	if (c)
		return c;

	for (int i = 0; i < MAX_CLIENTS; i++) {
		if (!clients[i].valid) {
			idx = i;
			break;
		}
	}

	/* table full: evict the least recently seen client, preferring the
	 * ones that are not associated */
	for (int pass = 0; idx < 0 && pass < 2; pass++) {
		time_t oldest = 0;

		for (int i = 0; i < MAX_CLIENTS; i++) {
			if (pass == 0 && clients[i].state == BNDSTRG_STA_ASSOC)
				continue;
			if (idx < 0 || clients[i].last_seen < oldest) {
				oldest = clients[i].last_seen;
				idx = i;
			}
		}
	}

	c = &clients[idx];
	/* never forget a client while the driver still blacklists it */
	if (c->valid && c->blocked_band)
		unblock_client(c);

	memset(c, 0, sizeof(*c));
	memcpy(c->addr, addr, MAC_ADDR_LEN);
	c->valid = 1;
	c->last_seen = time(NULL);
	return c;
}

static signed char best_rssi(const signed char *rssi, int count)
{
	signed char best = -128;
	for (int i = 0; i < count && i < 4; i++) {
		if (rssi[i] != (signed char)0x80 && rssi[i] != 0 && rssi[i] > best)
			best = rssi[i];
	}
	return best;
}

static void set_rssi(struct client_entry *c, unsigned char band, signed char rssi)
{
	if (rssi == -128 || rssi >= 0)
		return;
	c->rssi[BIDX(band)] = rssi;
	c->rssi_time[BIDX(band)] = time(NULL);
}

/* RSSI on a band if it was measured within max_age seconds, else 0 */
static int fresh_rssi(const struct client_entry *c, unsigned char band, int max_age)
{
	int b = BIDX(band);

	if (!c->rssi_time[b] || time(NULL) - c->rssi_time[b] > max_age)
		return 0;
	return c->rssi[b];
}

/* ---- Interfaces ---- */

static int band_ready(unsigned char band)
{
	for (int i = 0; i < num_ifaces; i++)
		if (ifaces[i].ready && ifaces[i].band == band)
			return 1;
	return 0;
}

/* The main interface of a band: the driver keeps one table per band, so any
 * of its interfaces reaches it. Prefer ra0/rax0, the first BSS. */
static const char *band_ifname(unsigned char band)
{
	const char *name = NULL;

	for (int i = 0; i < num_ifaces; i++) {
		if (!ifaces[i].ready || ifaces[i].band != band)
			continue;
		if (!name || strcmp(ifaces[i].ifname, name) < 0)
			name = ifaces[i].ifname;
	}
	return name;
}

/* ---- Driver communication ---- */

static int send_msg_to_driver(const char *ifname, BNDSTRG_MSG *msg)
{
	struct iwreq wrq;

	if (!ifname)
		return -1;

	memset(&wrq, 0, sizeof(wrq));
	strncpy(wrq.ifr_name, ifname, IFNAMSIZ - 1);
	wrq.u.data.pointer = msg;
	wrq.u.data.length = sizeof(BNDSTRG_MSG);
	wrq.u.data.flags = OID_BNDSTRG_MSG | OID_GET_SET_TOGGLE;

	if (ioctl(ioctl_fd, RT_PRIV_IOCTL, &wrq) < 0) {
		syslog(LOG_ERR, "ioctl %s action %d: %s", ifname, msg->Action,
		       strerror(errno));
		return -1;
	}

	return 0;
}

/* iwpriv <ifname> set <cmd> */
static int iwpriv_set(const char *ifname, const char *cmd)
{
	struct iwreq wrq;
	char buf[64];

	if (!ifname)
		return -1;

	snprintf(buf, sizeof(buf), "%s", cmd);
	memset(&wrq, 0, sizeof(wrq));
	strncpy(wrq.ifr_name, ifname, IFNAMSIZ - 1);
	wrq.u.data.pointer = buf;
	wrq.u.data.length = strlen(buf) + 1;

	if (ioctl(ioctl_fd, RTPRIV_IOCTL_SET, &wrq) < 0) {
		syslog(LOG_ERR, "iwpriv %s set %s: %s", ifname, cmd, strerror(errno));
		return -1;
	}

	return 0;
}

static int send_cli_add(unsigned char band, const unsigned char *addr)
{
	BNDSTRG_MSG msg;
	memset(&msg, 0, sizeof(msg));
	msg.Action = CLI_ADD;
	memcpy(msg.data.cli_add.Addr, addr, MAC_ADDR_LEN);

	return send_msg_to_driver(band_ifname(band), &msg);
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

	syslog(LOG_DEBUG, "onoff %s %s ch=%d mode=%d",
	       onoff ? "on" : "off", ifname, channel, mode);

	return send_msg_to_driver(ifname, &msg);
}

static int send_simple(const char *ifname, unsigned char action)
{
	BNDSTRG_MSG msg;
	memset(&msg, 0, sizeof(msg));
	msg.Action = action;
	/* heartbeat, inf_status_req and chanload_status_req all start with
	 * the interface name */
	strncpy(msg.data.heartbeat.ucIfName, ifname,
	        sizeof(msg.data.heartbeat.ucIfName) - 1);
	return send_msg_to_driver(ifname, &msg);
}

static int send_blacklist(unsigned char band, const unsigned char *addr, int add)
{
	const char *ifname = band_ifname(band);
	BNDSTRG_MSG msg;

	if (!ifname)
		return -1;

	memset(&msg, 0, sizeof(msg));
	msg.Action = UPDATE_WHITE_BLACK_LIST;
	strncpy(msg.data.update_white_black_list.ucIfName, ifname,
	        sizeof(msg.data.update_white_black_list.ucIfName) - 1);
	msg.data.update_white_black_list.list_type = BNDSTRG_BLACKLIST;
	memcpy(msg.data.update_white_black_list.Addr, addr, MAC_ADDR_LEN);
	msg.data.update_white_black_list.deladd = add ? 1 : 0;

	return send_msg_to_driver(ifname, &msg);
}

/* ---- Steering ---- */

static void unblock_client(struct client_entry *c)
{
	if (!c->blocked_band)
		return;

	syslog(LOG_DEBUG, MACFMT " unblocked on %s",
	       MACARG(c->addr), BNAME(c->blocked_band));
	send_blacklist(c->blocked_band, c->addr, 0);
	c->blocked_band = 0;
	c->block_until = 0;
}

static void steer_client(struct client_entry *c, unsigned char to, int rssi)
{
	unsigned char from = c->band;
	char cmd[40];
	time_t now = time(NULL);

	syslog(LOG_NOTICE, MACFMT " steering %s -> %s (rssi=%d)",
	       MACARG(c->addr), BNAME(from), BNAME(to), rssi);

	/* Keep the old band from answering it, then drop it there. */
	if (send_blacklist(from, c->addr, 1) == 0) {
		c->blocked_band = from;
		c->block_until = now + opt_block_time;
	}

	snprintf(cmd, sizeof(cmd), "DisConnectSta=" MACFMT, MACARG(c->addr));
	iwpriv_set(band_ifname(from), cmd);

	c->hold = 0;
	c->steer_to = to;
	c->steer_time = now;
	c->cooldown_until = now + opt_cooldown;
}

/* Called when a client associates: was it moved recently, and did it land
 * where it was sent? */
static void judge_steering(struct client_entry *c)
{
	time_t now = time(NULL);

	if (!c->steer_to)
		return;

	if (now - c->steer_time > RESULT_WINDOW) {
		c->steer_to = 0;
		return;
	}

	if (c->band == c->steer_to) {
		syslog(LOG_NOTICE, MACFMT " moved to %s",
		       MACARG(c->addr), BNAME(c->band));
		c->fails = 0;
	} else {
		if (c->fails < MAX_FAILS)
			c->fails++;
		/* it came back: leave it there, longer each time */
		c->cooldown_until = now + ((time_t)opt_cooldown << c->fails);
		syslog(LOG_NOTICE, MACFMT " returned to %s, next try in %lds",
		       MACARG(c->addr), BNAME(c->band),
		       (long)(c->cooldown_until - now));
	}
	c->steer_to = 0;
}

static void check_steering(void)
{
	time_t now = time(NULL);
	int ready = band_ready(BAND_24G) && band_ready(BAND_5G) &&
	            bands[B2G].enabled && bands[B5G].enabled;

	for (int i = 0; i < MAX_CLIENTS; i++) {
		struct client_entry *c = &clients[i];
		int cond = 0, rssi = 0;
		unsigned char to = 0;

		if (!c->valid)
			continue;

		if (c->blocked_band && now >= c->block_until)
			unblock_client(c);

		if (!ready || c->state != BNDSTRG_STA_ASSOC || c->steer_to)
			continue;
		if (now < c->cooldown_until || now - c->assoc_time < SETTLE_TIME)
			continue;

		if (c->band == BAND_24G) {
			/* Dual-band: it was heard on 5 GHz, or announced VHT */
			int dual = c->vht_capable ||
			           (c->seen[B5G] && now - c->seen[B5G] < SEEN_WINDOW);

			/* 5 GHz signal from a recent probe there, or estimated
			 * from the 2.4 GHz link */
			rssi = fresh_rssi(c, BAND_5G, PROBE_RSSI_AGE);
			if (!rssi) {
				rssi = fresh_rssi(c, BAND_24G, DATA_RSSI_AGE);
				if (rssi)
					rssi -= BAND_2G_PENALTY;
			}

			cond = dual && rssi && rssi >= opt_rssi_up;
			to = BAND_5G;
		} else if (c->band == BAND_5G) {
			rssi = fresh_rssi(c, BAND_5G, DATA_RSSI_AGE);
			cond = rssi && rssi <= opt_rssi_down;
			to = BAND_24G;
		}

		if (!cond) {
			c->hold = 0;
			continue;
		}

		if (c->hold < HOLD_CHECKS)
			c->hold++;
		if (c->hold < HOLD_CHECKS)
			continue;

		/* Do not cut a call or a stream: wait for a quiet moment. */
		if (c->pps > (unsigned int)opt_busy_pps) {
			syslog(LOG_DEBUG, MACFMT " busy (%u pps), steering postponed",
			       MACARG(c->addr), c->pps);
			continue;
		}

		steer_client(c, to, rssi);
	}
}

/* ---- Event processing ---- */

static void handle_cli_event(const BNDSTRG_MSG *msg)
{
	const struct bnd_msg_cli_event *ev = &msg->data.cli_event;
	struct client_entry *c;
	time_t now = time(NULL);
	int b = BIDX(ev->Band);

	switch (ev->FrameType) {
	case SYNC_FSM_PEER_PROBE_REQ:
	case APMT2_PEER_PROBE_REQ: {
		/* Track only clients that connected; probes from neighbors
		 * would fill the table. */
		const struct bnd_msg_cli_probe *probe = &ev->data.cli_probe;

		c = find_client(ev->Addr);
		if (!c)
			break;
		c->last_seen = now;
		c->seen[b] = now;
		set_rssi(c, ev->Band, best_rssi(probe->Rssi, 4));
		if (ev->Band == BAND_5G && probe->bVHTCapable)
			c->vht_capable = 1;
		break;
	}

	case AUTH_FSM_PEER_AUTH_REQ:
	case APMT2_PEER_AUTH_REQ: {
		const struct bnd_msg_cli_auth *auth = &ev->data.cli_auth;

		c = add_client(ev->Addr);
		c->last_seen = now;
		c->seen[b] = now;
		/* drivers without the frame type fix send no RSSI with auth */
		if (ev->FrameType == APMT2_PEER_AUTH_REQ)
			set_rssi(c, ev->Band, best_rssi(auth->Rssi, 4));

		syslog(LOG_DEBUG, "auth " MACFMT " %s rssi=%d", MACARG(ev->Addr),
		       BNAME(ev->Band), c->rssi[b]);
		break;
	}

	case APMT2_PEER_ASSOC_REQ: {
		const struct bnd_msg_cli_assoc *assoc = &ev->data.cli_assoc;

		c = add_client(ev->Addr);
		c->last_seen = now;
		c->seen[b] = now;
		/* VHT capabilities in a 2.4 GHz association still mean 5 GHz */
		if (assoc->bVHTCapable)
			c->vht_capable = 1;
		if (assoc->Nss > c->nss)
			c->nss = assoc->Nss;
		c->band = ev->Band;
		c->state = BNDSTRG_STA_ASSOC;
		c->assoc_time = now;
		c->hold = 0;
		c->pps = 0;
		c->pkts_time = 0;

		syslog(LOG_NOTICE, MACFMT " connected on %s (vht=%d nss=%d btm=%d)",
		       MACARG(ev->Addr), BNAME(ev->Band),
		       assoc->bVHTCapable, assoc->Nss, assoc->BTMSupport);

		judge_steering(c);

		/* The driver reports data RSSI only for clients in its table */
		send_cli_add(ev->Band, ev->Addr);
		break;
	}

	case APMT2_PEER_DISASSOC_REQ:
		c = find_client(ev->Addr);
		if (!c)
			break;

		syslog(LOG_NOTICE, MACFMT " disconnected from %s",
		       MACARG(ev->Addr), BNAME(ev->Band));

		/* a late disconnect from the old band must not undo a new
		 * association on the other one */
		if (c->band == ev->Band) {
			c->state = BNDSTRG_STA_DISASSOC;
			c->band = 0;
		}
		c->last_seen = now;
		c->hold = 0;
		break;

	default:
		syslog(LOG_DEBUG, "unknown frame type %d", ev->FrameType);
		break;
	}
}

static void handle_cli_status(const BNDSTRG_MSG *msg)
{
	const struct bnd_msg_cli_status_rsp *st = &msg->data.cli_status_rsp;
	struct client_entry *c = find_client(st->Addr);
	time_t now = time(NULL);
	unsigned long long pkts;

	if (!c || st->ReturnCode != 0 || c->state != BNDSTRG_STA_ASSOC)
		return;

	set_rssi(c, c->band, st->data_Rssi);

	pkts = st->data_tx_packets + st->data_rx_packets;
	if (c->pkts_time && now > c->pkts_time && pkts >= c->pkts)
		c->pps = (pkts - c->pkts) / (now - c->pkts_time);
	c->pkts = pkts;
	c->pkts_time = now;
}

static void handle_inf_status(const BNDSTRG_MSG *msg)
{
	const struct bnd_msg_inf_status_rsp *inf = &msg->data.inf_status_rsp;
	const char *name = inf->ucIfName;
	int found = -1;

	if (inf->band != BAND_24G && inf->band != BAND_5G)
		return;

	/* Driver may return empty ucIfName on query — derive from band */
	if (!name[0])
		name = inf->band == BAND_24G ? "ra0" : "rax0";

	syslog(LOG_DEBUG, "iface %s %s ch=%d vht=%d nss=%d ready=%d",
	       name, BNAME(inf->band), inf->Channel, inf->bVHTCapable,
	       inf->nss, inf->bInfReady);

	for (int i = 0; i < num_ifaces; i++) {
		if (strcmp(ifaces[i].ifname, name) == 0) {
			found = i;
			break;
		}
	}
	if (found < 0 && num_ifaces < MAX_IFACES) {
		found = num_ifaces++;
		snprintf(ifaces[found].ifname, sizeof(ifaces[found].ifname), "%s", name);
	}
	if (found < 0)
		return;

	ifaces[found].band = inf->band;
	if (inf->Channel)
		ifaces[found].channel = inf->Channel;
	ifaces[found].ready = inf->bInfReady;
	ifaces[found].vht_capable = inf->bVHTCapable;

	/* The driver turns steering off when the last interface of a band
	 * goes down; turn it back on when it returns. */
	if (!band_ready(inf->band))
		bands[BIDX(inf->band)].enabled = 0;
}

static void handle_onoff(const BNDSTRG_MSG *msg)
{
	const struct bnd_msg_onoff *onoff = &msg->data.onoff;
	unsigned char band = onoff->Band & BAND_5G ? BAND_5G : BAND_24G;

	syslog(LOG_DEBUG, "driver confirmed %s %s ch=%d",
	       onoff->OnOff ? "on" : "off", BNAME(band), onoff->Channel);
	bands[BIDX(band)].enabled = onoff->OnOff;
	if (onoff->OnOff)
		bands[BIDX(band)].enable_time = time(NULL);
}

/* The driver still holds the PID of an instance that died without turning
 * steering off, and rejects everything from us but ONOFF, including the
 * interface queries. ONOFF is accepted from any PID and rebinds the table
 * of the interface it is sent to, so send it to the main interface of each
 * band before the interfaces are even known. */
static void take_over(unsigned int pid)
{
	static const char *names[] = { "ra0", "rax0" };
	static time_t last;
	char path[64];
	time_t now = time(NULL);

	if (now - last < CHECK_INTERVAL)
		return;
	last = now;

	syslog(LOG_NOTICE, "driver bound to pid %u, taking over", pid);
	for (int i = 0; i < 2; i++) {
		unsigned char band = i ? BAND_5G : BAND_24G;

		snprintf(path, sizeof(path), "/sys/class/net/%s", names[i]);
		if (access(path, F_OK) != 0)
			continue;
		if (send_onoff(names[i], 1, band, 0, POST_CONNECTION_STEERING) == 0) {
			bands[BIDX(band)].enabled = 1;
			bands[BIDX(band)].enable_time = now;
		}
	}
	query_interfaces();
}

static void process_driver_msg(const BNDSTRG_MSG *msg)
{
	switch (msg->Action) {
	case CLI_EVENT:
		handle_cli_event(msg);
		break;
	case CLI_STATUS_RSP:
		handle_cli_status(msg);
		break;
	case INF_STATUS_RSP:
		handle_inf_status(msg);
		break;
	case BNDSTRG_ONOFF:
		handle_onoff(msg);
		break;
	case REJECT_EVENT:
		take_over(msg->data.reject_body.DaemonPid);
		break;
	case HEARTBEAT_MONITOR:
	case BNDSTRG_NEIGHBOR_REPORT:
		break;
	default:
		syslog(LOG_DEBUG, "unknown action %d", msg->Action);
		break;
	}
}

/* ---- Periodic work ---- */

/* Ask every MTK AP interface for its state. The driver also creates a band
 * table that could not be created at boot (channel=auto) on this request. */
static void query_interfaces(void)
{
	static const char *prefixes[] = { "ra", "rax" };
	char ifname[IFNAMSIZ], path[64];

	for (int p = 0; p < 2; p++) {
		for (int i = 0; i < 8; i++) {
			snprintf(ifname, sizeof(ifname), "%s%d", prefixes[p], i);
			snprintf(path, sizeof(path), "/sys/class/net/%s", ifname);
			if (access(path, F_OK) == 0)
				send_simple(ifname, INF_STATUS_QUERY);
		}
	}
}

static void enable_bands(void)
{
	static const unsigned char band_ids[2] = { BAND_24G, BAND_5G };

	if (!band_ready(BAND_24G) || !band_ready(BAND_5G))
		return;

	for (int b = 0; b < 2; b++) {
		unsigned char band = band_ids[b];
		const char *ifname = band_ifname(band);
		unsigned char channel = 0;

		if (bands[b].enabled || !ifname)
			continue;

		for (int i = 0; i < num_ifaces; i++)
			if (strcmp(ifaces[i].ifname, ifname) == 0)
				channel = ifaces[i].channel;

		syslog(LOG_NOTICE, "enabling band steering on %s (%s)",
		       BNAME(band), ifname);
		/* the driver confirms with a BNDSTRG_ONOFF event */
		if (send_onoff(ifname, 1, band, channel, POST_CONNECTION_STEERING) == 0) {
			bands[b].enabled = 1;
			bands[b].enable_time = time(NULL);
		}
	}
}

static void periodic(void)
{
	static time_t last_check, last_heartbeat;
	time_t now = time(NULL);

	if (now - last_heartbeat >= HEARTBEAT_INTERVAL) {
		last_heartbeat = now;
		for (int b = 0; b < 2; b++) {
			const char *ifname = band_ifname(b == B5G ? BAND_5G : BAND_24G);
			if (bands[b].enabled && ifname)
				send_simple(ifname, HEARTBEAT_MONITOR);
		}
	}

	if (now - last_check < CHECK_INTERVAL)
		return;
	last_check = now;

	if (!band_ready(BAND_24G) || !band_ready(BAND_5G))
		query_interfaces();
	enable_bands();

	/* fresh data RSSI and traffic of associated clients */
	for (int b = 0; b < 2; b++) {
		const char *ifname = band_ifname(b == B5G ? BAND_5G : BAND_24G);
		if (bands[b].enabled && ifname)
			send_simple(ifname, CLI_STATUS_REQ);
	}

	check_steering();

	for (int i = 0; i < MAX_CLIENTS; i++) {
		struct client_entry *c = &clients[i];
		if (c->valid && c->state != BNDSTRG_STA_ASSOC && !c->blocked_band &&
		    now - c->last_seen > CLIENT_EXPIRY) {
			syslog(LOG_DEBUG, "expiring client " MACFMT, MACARG(c->addr));
			memset(c, 0, sizeof(*c));
		}
	}
}

/* ---- Netlink event listener ---- */

/* Open netlink socket for wireless extension events (IFLA_WIRELESS in RTM_NEWLINK) */
static int open_wext_event_socket(void)
{
	int fd;
	int rcvbuf = 256 * 1024;
	struct sockaddr_nl addr;

	fd = socket(AF_NETLINK, SOCK_RAW, NETLINK_ROUTE);
	if (fd < 0) {
		syslog(LOG_ERR, "wext event socket: %s", strerror(errno));
		return -1;
	}

	/* probe events come in bursts; do not lose association events */
	setsockopt(fd, SOL_SOCKET, SO_RCVBUF, &rcvbuf, sizeof(rcvbuf));

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
 * iw_event netlink layout on aarch64 (64-bit, no compat):
 *   0-1: len, 2-3: cmd, 4-7: pad
 *   8-9: iw_point.length, 10-11: iw_point.flags
 *   12-15: pad, 16+: custom data (BNDSTRG_MSG)
 * The MTK driver sends: flags=OID_BNDSTRG_MSG, custom data=BNDSTRG_MSG struct.
 */
static void parse_wext_event(const char *data, int len)
{
	int offset = 0;

	while (offset + 4 <= len) {
		unsigned short ev_len, ev_cmd, flags;

		memcpy(&ev_len, data + offset, 2);
		memcpy(&ev_cmd, data + offset + 2, 2);

		if (ev_len < 4 || ev_len > len - offset)
			break;

		if (ev_cmd == IWEVCUSTOM && ev_len >= 16) {
			memcpy(&flags, data + offset + 10, 2);

			if (flags == OID_BNDSTRG_MSG &&
			    ev_len - 16 >= (int)sizeof(BNDSTRG_MSG)) {
				BNDSTRG_MSG msg_buf;
				memcpy(&msg_buf, data + offset + 16, sizeof(BNDSTRG_MSG));
				process_driver_msg(&msg_buf);
			}
		}

		offset += ev_len;
	}
}

static void read_events(int nl_fd)
{
	char buf[16384];
	struct nlmsghdr *nlh;
	int n = recv(nl_fd, buf, sizeof(buf), MSG_DONTWAIT);

	if (n < 0) {
		if (errno == ENOBUFS)
			syslog(LOG_WARNING, "netlink overrun, events lost");
		return;
	}

	for (nlh = (struct nlmsghdr *)buf; NLMSG_OK(nlh, (unsigned int)n);
	     nlh = NLMSG_NEXT(nlh, n)) {
		struct ifinfomsg *ifi;
		struct rtattr *rta;
		int rtalen;

		if (nlh->nlmsg_type != RTM_NEWLINK)
			continue;

		ifi = NLMSG_DATA(nlh);
		rta = IFLA_RTA(ifi);
		rtalen = IFLA_PAYLOAD(nlh);

		for (; RTA_OK(rta, rtalen); rta = RTA_NEXT(rta, rtalen))
			if (rta->rta_type == IFLA_WIRELESS)
				parse_wext_event(RTA_DATA(rta), RTA_PAYLOAD(rta));
	}
}

/* ---- Main ---- */

static void handle_signal(int sig)
{
	(void)sig;
	running = 0;
}

static void usage(const char *prog)
{
	fprintf(stderr,
		"usage: %s [-u dBm] [-d dBm] [-b s] [-c s] [-p pps] [-v]\n"
		"  -u  5 GHz signal needed to move a client up from 2.4 GHz (%d)\n"
		"  -d  5 GHz signal below which a client moves down (%d)\n"
		"  -b  seconds the old band ignores a moved client (%d)\n"
		"  -c  seconds between two moves of one client (%d)\n"
		"  -p  packets/s above which a client is left alone (%d)\n"
		"  -v  log debug messages\n",
		prog, opt_rssi_up, opt_rssi_down, opt_block_time, opt_cooldown,
		opt_busy_pps);
}

int main(int argc, char *argv[])
{
	int nl_fd, opt;
	fd_set rfds;
	struct timeval tv;

	while ((opt = getopt(argc, argv, "u:d:b:c:p:vh")) != -1) {
		switch (opt) {
		case 'u': opt_rssi_up = atoi(optarg); break;
		case 'd': opt_rssi_down = atoi(optarg); break;
		case 'b': opt_block_time = atoi(optarg); break;
		case 'c': opt_cooldown = atoi(optarg); break;
		case 'p': opt_busy_pps = atoi(optarg); break;
		case 'v': opt_verbose = 1; break;
		default:
			usage(argv[0]);
			return opt == 'h' ? 0 : 1;
		}
	}

	if (opt_rssi_up >= 0 || opt_rssi_down >= 0 || opt_rssi_down >= opt_rssi_up ||
	    opt_block_time < 1 || opt_cooldown < 1 || opt_busy_pps < 0) {
		fprintf(stderr, "invalid thresholds\n");
		usage(argv[0]);
		return 1;
	}

	openlog("bndstrg", LOG_PID | LOG_CONS, LOG_DAEMON);
	if (!opt_verbose)
		setlogmask(LOG_UPTO(LOG_INFO));
	syslog(LOG_NOTICE, "starting (up %d dBm, down %d dBm, block %ds, cooldown %ds)",
	       opt_rssi_up, opt_rssi_down, opt_block_time, opt_cooldown);

	signal(SIGINT, handle_signal);
	signal(SIGTERM, handle_signal);

	ioctl_fd = socket(AF_INET, SOCK_DGRAM, 0);
	if (ioctl_fd < 0) {
		syslog(LOG_ERR, "socket: %s", strerror(errno));
		return 1;
	}

	/* Listen first so no INF_STATUS_RSP sent at interface up is missed */
	nl_fd = open_wext_event_socket();
	if (nl_fd < 0)
		return 1;

	query_interfaces();

	while (running) {
		FD_ZERO(&rfds);
		FD_SET(nl_fd, &rfds);
		tv.tv_sec = 1;
		tv.tv_usec = 0;

		int ret = select(nl_fd + 1, &rfds, NULL, NULL, &tv);
		if (ret < 0) {
			if (errno == EINTR)
				continue;
			syslog(LOG_ERR, "select: %s", strerror(errno));
			break;
		}

		if (ret > 0 && FD_ISSET(nl_fd, &rfds))
			read_events(nl_fd);

		periodic();
	}

	syslog(LOG_NOTICE, "stopping");

	/* Lift every blacklist entry, then turn steering off */
	for (int i = 0; i < MAX_CLIENTS; i++)
		if (clients[i].valid)
			unblock_client(&clients[i]);

	for (int b = 0; b < 2; b++) {
		unsigned char band = b == B5G ? BAND_5G : BAND_24G;
		const char *ifname = band_ifname(band);

		if (bands[b].enabled && ifname)
			send_onoff(ifname, 0, band, 0, 0);
	}

	close(nl_fd);
	close(ioctl_fd);
	closelog();
	return 0;
}
