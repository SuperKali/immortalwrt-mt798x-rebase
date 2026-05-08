# ImmortalWrt - MT798x

```
This repository is worked on ImmortalWrt with MTK OpenWrt Feeds patches imported.
```

## Commit Cutoff Revisions

### ImmortalWrt: [2777fc6](https://github.com/immortalwrt/immortalwrt/commit/2777fc61da4bbcc66b5c73769ea7bce1f868f940) - OpenWrt 25.12.3

```
xdp-tools: fix BPFTOOL detection

Fix sh syntax error in configure script.

Signed-off-by: Tianling Shen <cnsztl@immortalwrt.org>
```

### MTK OpenWrt Feeds: [c0ef0ca](https://git01.mediatek.com/plugins/gitiles/openwrt/feeds/mtk-openwrt-feeds/+/c0ef0ca705bc7dad741fdfc65c60052725c3d7c1)

```
[][HIGH][kernel-6.12][mt7988][eth][Refactor XGMAC force mode to prevent from XGMAC Rx FIFO overflow]

[Description]
Refactor XGMAC force mode to prevent from XGMAC Rx FIFO overflow.

[Root Cause]
After an ETH hardware reset, the XGMAC link is up by default, and the
external 10G PHY may establish a link before mtk_mac_prepare() is
executed. Therefore, the ETH driver is unable to block traffic from
entering XGMAC before enabling XGMAC LOGIC_RESET.
As a result, we observed that this unexpected behavior can cause an
XGMAC Rx FIFO overflow when the ETH driver enables the XGMAC LOGIC_RESET
in mtk_mac_link_up().

[Solution]
Move the XGMAC force link down operation from mtk_mac_prepare() to
mtk_hw_init() to prevent traffic from entering XGMAC before enabling
XGMAC LOGIC_RESET.

[How to Verify]
N/A

[Info to Customer]
N/A


Change-Id: I663b9f34873be7410fe94711ee91b199b1c33357
Reviewed-on: https://gerrit.mediatek.inc/c/openwrt/feeds/mtk_openwrt_feeds/+/12074397
```

### l1parser: [081bb31](https://github.com/chasey-dev/l1parser/commit/081bb31211efc74594d25bfd1bb5811f3408a205)

```
feat(ucode): add get all device map support
```
## About External Devices HNAT
> [!WARNING]
> Current HNAT support for external devices is basic and lack of complete test for various types. Please use with caution.

> [!IMPORTANT]
> Please keep interface `rxppd` in your bridge device (e.g. `br-lan`) while using external device HNAT.

### Support Matrix:
|               |  Ext as WAN   | Ext as LAN                |
|   :----:      |   :----:      | :----:                    |
|  **Ethernet** |      ✔️       |   ❌                     |
| **AP/ApCli**  |      ✔️       |   ⚠️(**Untested**)       |

## Acknowledgements
HNAT support for external devices is adapted from [Padavanonly's repo](https://github.com/padavanonly/immortalwrt-mt798x-6.6). 