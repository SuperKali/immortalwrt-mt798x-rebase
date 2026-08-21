'use strict';
'require eqos.common as common';
'require form';
'require network';
'require poll';
'require uci';
'require ui';
'require view';

var live = common.sampler();

return view.extend({
	load: function() {
		/* The first sample only sets the reference the next one is measured
		   against, so it is taken here: by the time the poll fires there is a
		   rate to show instead of another blank round. */
		return Promise.all([
			uci.load('eqos'),
			network.getHostHints(),
			live.prime()
		]);
	},

	renderPresets: function() {
		return common.presetGrid(_('Add a profile from a preset:'),
			common.PRESETS, common.presetHint, function(preset) {
				return ui.createHandlerFn(this, function() {
					var name = preset.id;
					var n = 1;

					while (uci.get('eqos', name))
						name = '%s%d'.format(preset.id, ++n);

					uci.add('eqos', 'profile', name);
					uci.set('eqos', name, 'name', preset.name);
					for (var k in preset.opts)
						uci.set('eqos', name, k, preset.opts[k]);

					return uci.save().then(function() {
						window.location.reload();
					});
				});
			});
	},

	render: function(data) {
		var hosts = data[1] ? data[1].hosts || {} : {};
		var hostChoices = common.collectHostChoices(hosts);
		var hostNames = common.hostNameMap(hosts);
		var m, s, o;

		m = new form.Map('eqos', _('EQoS'),
			_('A profile sets the rates for every device that uses it, replacing what the device rule says. Share it and all members sit on one queue, splitting the bandwidth between them. Leave it unshared and each member gets the full rates.'));

		s = m.section(form.GridSection, 'profile', _('Profiles'));
		s.addremove = true;
		s.anonymous = false;
		s.nodescriptions = true;
		s.addbtntitle = _('Add profile');

		/* Deleting the group deletes the rules that belonged to it. Left
		   behind they point at a profile that is gone, and the service refuses
		   the whole configuration over it. */
		s.handleRemove = function(section_id, ev) {
			common.syncProfileMembers(section_id, []);

			return form.GridSection.prototype.handleRemove.apply(this,
				[ section_id, ev ]);
		};
		s.tab('general', _('General Settings'));
		s.tab('advanced', _('Advanced'));

		o = s.taboption('general', form.Value, 'name', _('Display name'),
			_('Replaces the section name when you pick the profile.'));
		o.rmempty = true;
		o.placeholder = _('unspecified');

		/* A profile is already a group: every device rule pointing at it takes
		   its rates. What was missing was a way to see and edit the membership
		   from the profile, instead of opening one device rule per member. The
		   list writes the same device sections the other tab shows, so the two
		   views stay one configuration. */
		o = s.taboption('general', form.DynamicList, '_members', _('Devices'),
			_('The devices that take this profile. Adding one here creates its rule for you, removing one deletes that rule.'));
		/* retain, or the value is lost: LuCI removes any option it
		   did not render, and a modalonly option is not rendered when
		   the grid itself is saved. */
		o.modalonly = true;
		o.retain = true;
		o.datatype = 'or(macaddr,ip4addr("nomask"),ip6addr("nomask"))';
		o.placeholder = _('MAC or IP address');
		common.addChoices(o, hostChoices.mac.concat(hostChoices.ip));

		o.cfgvalue = function(section_id) {
			return common.profileMembers(section_id).map(common.memberAddress);
		};

		o.write = function(section_id, values) {
			common.syncProfileMembers(section_id,
				L.toArray(values).filter(function(v) { return v; }));
		};

		/* An emptied list still has to reach write(), otherwise dropping the
		   last member would leave its rule behind. */
		o.remove = function(section_id) {
			common.syncProfileMembers(section_id, []);
		};

		/* A count once there is more than one: the full list runs the column
		   several lines deep and pushes every other figure out of sight, and
		   the names are one click away in the editor anyway. */
		o = s.option(form.DummyValue, '_group', _('Devices'));
		o.textvalue = function(section_id) {
			var members = common.profileMembers(section_id);

			if (!members.length)
				return E('em', { 'class': 'eqos-muted' }, _('no device yet'));

			if (members.length === 1)
				return E('div', { 'class': 'eqos-members' },
					common.describeRule(hostNames, members[0]['.name'],
						common.memberAddress(members[0])));

			return E('div', { 'class': 'eqos-members' },
				_('%d devices').format(members.length));
		};

		/* What the profile is actually carrying, summed over its members: on
		   its own a profile has no traffic, it is the devices that do. */
		o = s.option(form.DummyValue, '_traffic', _('Traffic'));
		o.textvalue = function(section_id) {
			return E('div', { 'id': 'eqos-live-' + section_id },
				common.liveCell(null));
		};

		o = s.taboption('general', form.ListValue, 'priority', _('Priority'),
			_('Decides both the scheduling weight and which queue the profile gets, so it counts under either scheduling mode.'));
		common.addPriorityChoices(o);
		o.rmempty = false;
		o.textvalue = function(section_id) {
			return common.priorityBadge(uci.get('eqos', section_id, 'priority') || 'normal');
		};

		o = s.taboption('general', form.Flag, 'shared', _('Share bandwidth'),
			_('All members sit on one queue and split the rates below, instead of each getting them in full.'));
		o.default = o.disabled;
		o.rmempty = false;

		o = common.rateOption(s.taboption('general', form.Value, 'download',
			_('Download'),
			_('Top speed in Mbit/s. Use 0 to leave it unlimited.')));
		o.rmempty = false;
		o.textvalue = function(section_id) {
			return common.fmtKbit(Number(uci.get('eqos', section_id, 'download') || 0));
		};

		o = common.rateOption(s.taboption('general', form.Value, 'upload',
			_('Upload'),
			_('Top speed in Mbit/s. Use 0 to leave it unlimited.')));
		o.rmempty = false;
		o.textvalue = function(section_id) {
			return common.fmtKbit(Number(uci.get('eqos', section_id, 'upload') || 0));
		};

		o = common.rateOption(s.taboption('general', form.Value, 'min_download',
			_('Guaranteed download'),
			_('Speed in Mbit/s the scheduler keeps for this queue. Leave it at 0 to set only a ceiling.')));
		o.modalonly = true;
		o.retain = true;

		o = common.rateOption(s.taboption('general', form.Value, 'min_upload',
			_('Guaranteed upload'),
			_('Speed in Mbit/s the scheduler keeps for this queue. Leave it at 0 to set only a ceiling.')));
		o.modalonly = true;
		o.retain = true;

		common.weightOption(s, form, 'advanced');

		common.queueOption(s, form, 'advanced',
			_('Keeps this profile on a fixed queue instead of letting the service choose. Use 1 to %d for a hardware queue, or %d and above for software shaping. The numbers in between belong to the queues that carry everything else.')
				.format(common.HW_SLOT_MAX, common.SOFT_SLOT_BASE));

		var self = this;

		poll.add(live.poll(function(rules, rates) {
			var byProfile = {};

			rules.forEach(function(r) {
				if (!r.profile)
					return;

				var a = rates.addresses[r.address];
				if (!a)
					return;

				if (!byProfile[r.profile])
					byProfile[r.profile] = { down: 0, up: 0 };

				byProfile[r.profile].down += a.down || 0;
				byProfile[r.profile].up += a.up || 0;
			});

			uci.sections('eqos', 'profile').forEach(function(p) {
				var node = document.getElementById('eqos-live-' + p['.name']);

				/* Past the first poll, a profile with no members is not
				   pending: it is carrying nothing. */
				if (node)
					L.dom.content(node, common.liveCell(
						byProfile[p['.name']] || { down: 0, up: 0 }));
			});
		}));

		/* The presets belong to the table they add rows to, so they go inside
		   the section and under its heading. Rendered before the form they
		   ended up above the page title, which put them before the thing they
		   are part of. */
		return m.render().then(function(formNode) {
			var section = formNode.querySelector('.cbi-section');
			var heading = section ? section.querySelector('h3, legend') : null;

			if (heading)
				heading.parentNode.insertBefore(self.renderPresets(),
					heading.nextSibling);
			else if (section)
				section.insertBefore(self.renderPresets(), section.firstChild);

			return E([], [ common.style(), formNode ]);
		});
	}
});
