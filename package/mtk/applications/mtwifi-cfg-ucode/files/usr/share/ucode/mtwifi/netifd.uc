'use strict';
import * as libubus from 'ubus';
import * as fs from 'fs';

import { log } from 'mtwifi.utils';

const CMD_UP = 0;
const CMD_SET_DATA = 1;
const CMD_PROCESS_ADD = 2;
const CMD_PROCESS_KILL_ALL = 3;
const CMD_SET_RETRY = 4;

global.ubus = libubus.connect();

function cmd_name(command) {
	switch (command) {
	case CMD_UP:
		return "set_up";
	case CMD_SET_DATA:
		return "set_data";
	case CMD_PROCESS_ADD:
		return "add_process";
	case CMD_PROCESS_KILL_ALL:
		return "kill_all";
	case CMD_SET_RETRY:
		return "set_retry";
	default:
		return `unknown(${command})`;
	}
};

function call_result(ret) {
	return {
		ok: (ret != null),
		err: (ret == null) ? global.ubus.error() : null,
		reply: ret
	};
};

export function notify(command, params, data) {
	params ??= {};
	data ??= {};

	let req = { command, device: global.radio, ...params, data };
	let res = call_result(global.ubus.call('network.wireless', 'notify', req));

	log.debug(`[Diag] netifd.notify cmd=${cmd_name(command)} radio=${global.radio} interface=${params.interface || "-"} vlan=${params.vlan || "-"} ifname=${data.ifname || "-"} ok=${res.ok ? true : false} err=${res.err == null ? 0 : res.err} reply=${res.reply}`);
	return res;
};

export function set_up() {
	return notify(CMD_UP);
};

export function set_data(data) {
	return notify(CMD_SET_DATA, null, data);
};

export function add_process(exe, pid, required, keep) {
	exe = fs.realpath(exe);

	return notify(CMD_PROCESS_ADD, null, { pid, exe, required, keep });
};

export function set_retry(retry) {
	return notify(CMD_SET_RETRY, null, { retry });
};

export function set_vif(interface, ifname) {
	return notify(CMD_SET_DATA, { interface }, { ifname });
};

export function set_vlan(interface, ifname, vlan) {
	return notify(CMD_SET_DATA, { interface, vlan }, { ifname });
};

export function status(device) {
	let req = device ? { device } : {};
	let res = call_result(global.ubus.call('network.wireless', 'status', req));

	log.debug(`[Diag] netifd.status radio=${device || "-"} ok=${res.ok ? true : false} err=${res.err == null ? 0 : res.err} reply=${res.reply}`);
	return res;
};

export function setup_failed(reason) {
	log.error(`[Netifd] Device setup failed: ${reason}`);
	printf('%s\n', reason);
	set_retry(false);
};
