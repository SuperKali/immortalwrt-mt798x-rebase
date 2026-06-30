include $(TOPDIR)/rules.mk

PKG_NAME:=linkup-rpcd
PKG_VERSION:=1.0
PKG_RELEASE:=1
PKG_MAINTAINER:=SuperKali <hello@superkali.me>
PKG_LICENSE:=GPL-2.0

include $(INCLUDE_DIR)/package.mk

define Package/linkup-rpcd
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=LinkUp OS rpcd API (modem/sim/net/wifi/system)
  DEPENDS:=+rpcd +rpcd-mod-luci +rpcd-mod-iwinfo +libubox +jshn +jq \
	   +sms-tool +modemband +lpac +luci-app-3ginfo-lite +atc-fib-fm350_gl
  PKGARCH:=all
endef

define Package/linkup-rpcd/description
  rpcd backend objects for the LinkUp OS web UI. Wraps 3ginfo-lite, modemband,
  sms_tool and lpac and exposes normalized JSON over ubus for the Vue SPA.
endef

define Build/Compile
endef

define Package/linkup-rpcd/install
	$(CP) ./files/* $(1)/
	chmod 0755 $(1)/usr/libexec/rpcd/linkup.*
endef

define Package/linkup-rpcd/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || /etc/init.d/rpcd reload
exit 0
endef

$(eval $(call BuildPackage,linkup-rpcd))
