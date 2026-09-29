# Web instance lifecycle improvement

English | [中文](web-instance-lifecycle.zh.md)

## Summary

Each local `dsh web` invocation needs its own listening port and browser window. A fixed default port makes the second process fail with `EADDRINUSE`. The shipped Web bundle owns the WebServer configuration, so the fork changes that fallback to port `0`; the OS assigns a free port and the URL printed after bind identifies the instance. An explicit `--port` retains its exact meaning.

## Completion boundary

Port allocation alone does not establish browser-window ownership. The current default-browser opener hands a URL to the operating system and has no reliable window handle; closing that window does not signal the Web process. A complete window-owned lifecycle needs an authenticated client presence protocol that tolerates refresh and temporary disconnects, followed by a bounded shutdown of only the owning process. It also needs a two-process browser test recording PID, port, session persistence, gateway state, and close behavior. Until that protocol and test are shipped, the process remains open after its window closes and the user must stop it explicitly.

## Compatibility and verification

This is an `upstream-package-change`: a profile overlay cannot change the default behavior of the shipped `dsh web` command, and no public Web lifetime service owns browser close. Session data and model-visible events are unchanged by port allocation. Verify the Loader-resolved default and explicit port, then start two independent Web processes and confirm different reachable ports. The browser-close protocol requires separate lifecycle, teardown, and browser evidence before this improvement becomes active.
