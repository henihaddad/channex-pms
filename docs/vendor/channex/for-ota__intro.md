<!-- https://docs.channex.io/for-ota/intro.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/for-ota/intro.md).

# Intro

Here we have 2 API for OTA to connect with Channex

## Open Channel API

This is a push API which means we will push real time availability and rates to your side. You will save these updates and "cache" them. Any searches on your OTA will search the cache.

**IP Addresses if you require whitelisting**

| Production      | Staging       |
| --------------- | ------------- |
| 143.198.250.110 | 178.128.141.2 |
| 134.209.134.83  |               |

## Shopping API

This API allows you to pull real time price and availability from Channex. This is suitable if you don't save any prices on your side and need a real time API to get the details.

Please reach out to <support@channex.io> before integrating so we can discuss the best approach.
