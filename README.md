# ImmortalWrt - MT798x

```
This repository is worked on ImmortalWrt with MTK OpenWrt Feeds patches imported.
```

## Commit Cutoff Revisions

### ImmortalWrt: [b4efc93](https://github.com/immortalwrt/immortalwrt/commit/b4efc93f5b40529881058b709869c04c393be95f)

```
Merge Official Source

Signed-off-by: Tianling Shen <cnsztl@immortalwrt.org>
```

### MTK OpenWrt Feeds: [64e3431](https://git01.mediatek.com/plugins/gitiles/openwrt/feeds/mtk-openwrt-feeds/+/64e34317a7a999400445eb244678d99d18914fda)

```
[][kernel-6.12][common][eth][Update Airoha AN8811HB 2.5G PHY driver to v1.0.3]

[Description]
*** Too long for revision, see link above ***

[Release-log]
N/A


Change-Id: I5d85702e3fc347b5ce6f93efdcbf2bd9847ef188
Reviewed-on: https://gerrit.mediatek.inc/c/openwrt/feeds/mtk_openwrt_feeds/+/12385519
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