'use strict';
'require eqos.common as common';
'require form';
'require uci';
'require view';

return view.extend({
	load: function() {
		return uci.load('eqos');
	},

	render: function() {
		var m, s, o;

		m = new form.Map('eqos', _('EQoS'),
			_('Network speed control service for MediaTek HNAT.'));

		s = m.section(form.NamedSection, 'config', 'eqos', _('Settings'));
		s.anonymous = true;
		s.tab('general', _('General Settings'));
		s.tab('advanced', _('Advanced'));

		o = s.taboption('general', form.Flag, 'enabled', _('Enable'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('general', form.Value, 'download',
			'%s (Mbit/s)'.format(_('Download')),
			_('Total download speed of the line. Set it a little below what the line really delivers, around 95%, or the scheduler never becomes the bottleneck and priorities have nothing to arbitrate. Traffic that no device rule matches gets this as its limit.'));
		o.datatype = 'and(uinteger,min(1),max(10000))';
		o.rmempty = false;
		o.write = common.integerWrite;

		o = s.taboption('general', form.Value, 'upload',
			'%s (Mbit/s)'.format(_('Upload')),
			_('Total upload speed of the line. Set it a little below what the line really delivers, around 95%, or the scheduler never becomes the bottleneck and priorities have nothing to arbitrate. Traffic that no device rule matches gets this as its limit.'));
		o.datatype = 'and(uinteger,min(1),max(10000))';
		o.rmempty = false;
		o.write = common.integerWrite;

		o = s.taboption('general', form.ListValue, 'direction', _('HQoS direction'),
			_('Upload shaping in hardware starts only when the WAN device name begins with the one the accelerator knows about, so it never runs when the WAN is an external device.'));
		o.value('both', _('Both directions'));
		o.value('downlink', _('Download only'));
		o.value('uplink', _('Upload only'));
		o.default = 'both';
		o.rmempty = false;

		o = s.taboption('general', form.ListValue, 'scheduler', _('Scheduling'),
			_('Weighted round robin splits the line between the queues by weight. Strict priority always serves the highest queue first.'));
		o.value('wrr', _('Weighted round robin'));
		o.value('sp', _('Strict priority'));
		o.default = 'wrr';
		o.rmempty = false;

		o = s.taboption('advanced', form.ListValue, 'aqm', _('Queue discipline'),
			_('What sits at the bottom of each queue. It does not change the rates, it decides how long a packet waits once a queue starts to fill. Automatic takes cake where the kernel has it and falls back to fq_codel.'));
		o.value('', _('Automatic'));
		o.value('cake', _('cake'));
		o.value('fq_codel', _('fq_codel'));
		o.value('none', _('none'));
		o.rmempty = true;

		o = s.taboption('advanced', form.ListValue, 'classifier',
			_('Classification'),
			_('How a packet finds its queue when shaping runs in software. In the packet the firewall writes the queue into the packet itself and the scheduler reads it straight away, which is the cheaper path on a router with few cores. Mirrored copies every frame onto a second device and walks a list of filters on both, which is what earlier versions did.'));
		o.value('priority', _('In the packet'));
		o.value('filters', _('Mirrored'));
		o.default = 'priority';
		o.rmempty = false;

		o = s.taboption('advanced', form.Value, 'min_floor',
			_('Floor for queues with no guarantee'),
			_('Speed in kbit/s a queue keeps when it asked for no guarantee and everything else is busy. Raise it to stop low priority devices from being squeezed to nothing, lower it to give the high priority ones more room.'));
		o.datatype = 'and(uinteger,min(1),max(100000))';
		o.rmempty = true;
		o.placeholder = '128';

		/* Weighted round robin splits the line in proportion to these four
		   numbers, so their distance is what a priority level is worth. */
		o = s.taboption('advanced', form.Value, 'weight_critical',
			_('Weight of critical'),
			_('How the four priority levels split the line under weighted round robin. What counts is the distance between them: at 15 against 1, a critical queue gets fifteen times the share of a low one when both want more than there is. Strict priority ignores these.'));
		o.datatype = 'and(uinteger,min(1),max(%d))'.format(common.WEIGHT_MAX);
		o.rmempty = true;
		o.placeholder = '15';

		o = s.taboption('advanced', form.Value, 'weight_high', _('Weight of high'));
		o.datatype = 'and(uinteger,min(1),max(%d))'.format(common.WEIGHT_MAX);
		o.rmempty = true;
		o.placeholder = '8';

		o = s.taboption('advanced', form.Value, 'weight_normal', _('Weight of normal'));
		o.datatype = 'and(uinteger,min(1),max(%d))'.format(common.WEIGHT_MAX);
		o.rmempty = true;
		o.placeholder = '4';

		o = s.taboption('advanced', form.Value, 'weight_low', _('Weight of low'));
		o.datatype = 'and(uinteger,min(1),max(%d))'.format(common.WEIGHT_MAX);
		o.rmempty = true;
		o.placeholder = '1';

		o = s.taboption('advanced', form.ListValue, 'download_mode',
			_('Download shaping'),
			_('A hardware queue only limits what leaves through the wired ports, so on a bridge with a radio it misses the Wi-Fi clients. Automatic moves download shaping to software when it finds a radio, which costs the hardware offload for the devices that have a rule.'));
		o.value('auto', _('Automatic'));
		o.value('hardware', _('Hardware queues'));
		o.value('software', _('Software on the LAN bridge'));
		o.default = 'auto';
		o.rmempty = false;

		o = s.taboption('advanced', form.ListValue, 'upload_mode', _('Upload shaping'),
			_('The hardware queues can shape upload only when the traffic reaches the QDMA scheduler, and that never happens on an external WAN device. Automatic switches to software shaping when it finds one.'));
		o.value('auto', _('Automatic'));
		o.value('hardware', _('Hardware queues'));
		o.value('software', _('Software on the WAN device'));
		o.default = 'auto';
		o.rmempty = false;

		o = s.taboption('advanced', form.Value, 'wan_device', _('WAN device'),
			_('Leave it empty to use the device of the wan interface.'));
		o.depends('upload_mode', 'auto');
		o.depends('upload_mode', 'software');
		o.rmempty = true;
		o.placeholder = 'auto';

		o = s.taboption('advanced', form.Value, 'bind_rate',
			_('HNAT binding threshold'),
			_('How many packets a flow has to carry before the accelerator takes it over. The service writes the same value to the turboacc configuration.'));
		o.datatype = 'and(uinteger,min(1),max(30))';
		o.default = '5';
		o.rmempty = false;
		o.write = common.integerWrite;

		return m.render();
	}
});
