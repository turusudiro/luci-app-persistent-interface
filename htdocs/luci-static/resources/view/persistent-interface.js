'use strict';
'require form';
'require uci';
'require ui';
'require fs';

const persistentBasePath = '/etc/persistent-interface/';
const globalscriptPath = '/etc/persistent-interface/globalscript.sh'

return L.view.extend({
  load: function () {
    return uci.load('persistent-interface');
  },

  render: function () {
    const sections = uci.sections('persistent-interface').filter(s => s['.type'] === 'interface');

    var m = new form.Map('persistent-interface', _('Persistent Interface'), _('Assign MAC addresses to interface names.'));
    m.tabbed = true;

    var s = m.section(form.NamedSection, 'global', 'Global');
    s.render = L.bind(function (view) {
      return form.NamedSection.prototype.render.apply(this, this.varargs(arguments, 1)).then(L.bind(function (node) {
        var actions = defaultFooter(view, m);
        node.appendChild(actions);
        return node;
      }, this));
    }, s, this);

    s.option(
      form.SectionValue,
      'global',
      form.NamedSection,
      'global',
      'settings',
      _('Global Settings'),
      _('This tab allows you to configure global options.')
    );
    var status = s.option(form.DummyValue);

    status.option = '\u00a0';
    status.title = '\u00a0';
    status.readonly = true;
    status.rawhtml = true;

    L.resolveDefault(uci.get('persistent-interface', 'global', 'enabled'), null).then(res => {
      status.default = res === '1'
        ? "<span style='color:#4BB543;font-weight:bold;'>✔️ Enabled</span>"
        : "<span style='color:#D9534F;font-weight:bold;'>❌ Disabled</span>";
    });


    s.option(form.Flag, 'enabled', 'Enable service');

    s.option(form.Flag, 'script', 'Enable global script');

    s.option(form.Flag, 'logging', 'Enable Logging');

    var sc = m.section(form.NamedSection, 'global', 'Global Script');
    sc.description = "This is the script that will run after any interface on the list is " +
      'successfully rename.';

    var o = sc.option(form.TextValue);
    o.placeholder = '#!/bin/sh\n/etc/init.d/network restart'
    o.rows = 20;
    o.load = function () {
      return fs.read(globalscriptPath).catch(() => {
        return '';
      });
    }

    var scBtn = sc.option(form.Button);
    scBtn.inputtitle = "Run Script";
    scBtn.inputstyle = "positive";
    scBtn.onclick = function (btn, section_id) {
      testScript(o.formvalue('global'));
    };

    sc.render = L.bind(function (view) {
      return form.NamedSection.prototype.render.apply(this, this.varargs(arguments, 1)).then(L.bind(function (node) {
        var actions = E('div', { 'class': 'cbi-page-actions' }, [
          E('button', {
            'class': 'cbi-button cbi-button-save',
            'click': ui.createHandlerFn(view, handleSaveGlobalScript, o)
          }, _('Save')),

          ' '
        ]);

        node.appendChild(actions);
        return node;
      }, this));
    }, sc, this);

    var t = m.section(form.NamedSection, 'global', 'List Interfaces');

    var tab = t.option(
      form.SectionValue,
      'interface_list',
      form.GridSection,
      'interface',
    );

    tab.subsection.render = L.bind(function (view) {
      return form.GridSection.prototype.render.apply(this, this.varargs(arguments, 1)).then(L.bind(function (node) {
        var actions = defaultFooter(view, this.map);
        node.appendChild(actions);
        return node;
      }, this));
    }, tab.subsection, this);

    var ss = tab.subsection;

    ss.nodescriptions = true;
    ss.anonymous = false;
    ss.addremove = true;
    ss.sortable = true;

    ss.tab('edit', 'Interface Settings');
    ss.tab('script', 'Script Settings');

    var ifname = ss.taboption('edit', form.Value, 'ifname', _('Interface Name'));
    ifname.datatype = 'uciname';
    ifname.optional = false;
    ifname.rmempty = false;
    ifname.placeholder = "ethX";
    var mac = ss.taboption('edit', form.Value, 'mac', _('MAC Address'));
    mac.datatype = 'macaddr';
    mac.optional = false;
    mac.rmempty = false;
    mac.placeholder = "XX:XX:XX:XX:XX:XX";
    mac.description = "Enter the MAC address of the target interface."

    ss.addModalOptions = function (modalSection, section_id, ev) {
      ss.modaltitle = 'Edit ' + section_id;

      var scriptEnabled = modalSection.taboption('script', form.Flag, 'script');
      scriptEnabled.title = "Enable";

      var scriptPath = persistentBasePath + section_id + '_post_rename.sh';
      var scriptToRun = fs.read(scriptPath).catch(() => {
        return '';
      });

      var script = modalSection.taboption('script', form.TextValue, 'shell', 'Post-rename script');
      script.description = "This is the content of the script file that will be executed automatically " +
        "after a network interface has been successfully renamed. " +
        `Note: You should manually delete the file ${scriptPath} after removing this item.`;

      script.rows = 15;
      script.placeholder = `#!/bin/sh

# EXAMPLE: Reset the 'wan' interface cleanly if it fails to get an IP
# This is useful after renaming, when DHCP or firewall rules aren't working properly.

r=$(date +%s | md5sum | cut -c1-8)  # Generate a short random tag
uci set network.wan._reload_tag="owrt_$r"  # Apply harmless dummy config change
uci commit network
/etc/init.d/network reload  # Triggers netifd to reinitialize the interface
`;


      script.rmempty = true;
      script.load = function () { return scriptToRun; };
      script.write = function (section_id, value) { writeToPersistentInterface(scriptPath, value) };

      var btnRun = modalSection.taboption('script', form.Button);
      btnRun.title = "\u00a0";
      btnRun.inputstyle = "positive";
      btnRun.inputtitle = "Run Script";
      btnRun.description = "Test the script.";

      btnRun.onclick = function (btn, section_id) {
        testScript(script.formvalue(section_id));
      };
    };
    return m.render();
  },
  handleSave: null,
  handleSaveApply: null,
  handleReset: null
});

function handleSaveGlobalScript(o) {
  return fs.write(globalscriptPath, o.formvalue('global'), 0o755).then(() => {
    ui.addTimeLimitedNotification(null, E('p', _('Changes saved.')), 5000, 'info');
  }).catch(function (err) {
    ui.addNotification(_('Save failed'), E('p', err.message), 'danger');
  });
}
function writeToPersistentInterface(filename, content) {
  return ensurePersistentDir()
    .then(() => fs.write(filename, content, 0o755))
    .then(() => {
      ui.addNotification(_('Success'), _('File written to: ') + filename, 'info');
    })
    .catch(err => {
      ui.addNotification(_('Write failed'), E('pre', err.message || String(err)), 'danger');
    });
}
function testScript(scriptContent) {
  const testPath = persistentBasePath + 'luci-temp-test.sh';

  if (!scriptContent.trim().startsWith('#!')) {
    ui.addNotification(_('Test Failed'), _('Script must begin with a shebang (e.g., "#!/bin/sh")'), 'danger');
    return Promise.reject('Missing shebang');
  }

  return ensurePersistentDir()
    .then(() => fs.write(testPath, scriptContent, 0o755))
    .then(() => fs.exec(testPath))
    .then(res => {
      ui.addNotification(_('Test Output'), E('pre', res.stdout || '(no output)'), 'info');
    })
    .catch(err => {
      ui.addNotification(_('Test Failed'), E('pre', err.message || String(err)), 'danger');
    })
    .finally(() => {
      fs.remove(testPath).catch(() => {
        // Silently ignore cleanup errors
      });
    });
}

function ensurePersistentDir() {
  return fs.stat(persistentBasePath).catch(() => {
    return fs.exec('/bin/mkdir', ['-p', persistentBasePath]);
  });
}

function defaultFooter(view, map) {
  return E('div', { 'class': 'cbi-page-actions' }, [
    E('button', {
      'class': 'cbi-button cbi-button-apply',
      'click': ui.createHandlerFn(view, () => {
        map.save();
        ui.changes.apply();
      })
    }, _('Save & Apply')),

    ' ',
    E('button', {
      'class': 'cbi-button cbi-button-save',
      'click': ui.createHandlerFn(view, () => map.save())
    }, _('Save')),

    ' ',
    E('button', {
      'class': 'cbi-button cbi-button-reset',
      'click': ui.createHandlerFn(view, () => map.reset())
    }, _('Reset'))
  ]);
}
