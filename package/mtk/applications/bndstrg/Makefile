include $(TOPDIR)/rules.mk

PKG_NAME:=bndstrg
PKG_VERSION:=1.0
PKG_RELEASE:=1

include $(INCLUDE_DIR)/package.mk

define Package/bndstrg
  SECTION:=MTK Properties
  CATEGORY:=MTK Properties
  SUBMENU:=Applications
  TITLE:=Band Steering Daemon for MTK WiFi
  DEPENDS:=+kmod-mt_wifi
endef

define Package/bndstrg/description
  Userspace band steering daemon for MediaTek mt_wifi driver.
  Steers dual-band capable clients to 5GHz when signal is adequate.
endef

define Build/Prepare
	$(INSTALL_DIR) $(PKG_BUILD_DIR)
	$(CP) ./src/* $(PKG_BUILD_DIR)/
endef

define Build/Compile
	$(TARGET_CC) $(TARGET_CFLAGS) $(TARGET_LDFLAGS) \
		-o $(PKG_BUILD_DIR)/bndstrg \
		$(PKG_BUILD_DIR)/bndstrg.c
endef

define Package/bndstrg/install
	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/bndstrg $(1)/usr/sbin/
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/bndstrg.init $(1)/etc/init.d/bndstrg
endef

$(eval $(call BuildPackage,bndstrg))
