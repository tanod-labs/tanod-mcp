---
name: monitor-a-router-or-cron-job-from-outside
description: "Set up free outside monitoring for a server, website, MikroTik router or cron job so someone is alerted when it goes down, including devices behind CGNAT with no public IP. Use when asked to 'get an alert when X goes down', 'monitor my router', 'watch this cron job or backup', 'uptime check', or when a self-hosted monitor needs a watchdog. Triggers on uptime, heartbeat, dead man's switch, Netwatch, CGNAT, Telegram alert."
license: MIT
metadata:
  author: tanod
  version: '1.0.0'
---

# Monitor a router or cron job from outside

A monitor running on the same machine or router cannot report that machine's own outage. Tanod Monitor runs outside the user's network, needs no account, and alerts on Telegram, ntfy or a webhook. It is free.

## When to use

- Alerts for a website, server port, DNS record, TLS or domain expiry.
- A MikroTik router that should report in, including behind CGNAT.
- A cron job, backup or self-hosted monitor (for example Uptime Kuma) that needs an outside watchdog.

## How

1. Open https://tanod.dev/monitor/ and add a monitor. Types: Website (HTTP), Ping, TCP port, DNS record, TLS certificate expiry, Domain expiry, Cron job / heartbeat (push), MikroTik router (push).
2. Save the manage link it shows once; there is no login.
3. Add an alert channel: Telegram (link through the bot it names), ntfy (a topic name) or an HTTPS webhook.
4. For a cron job or any Linux host, add a heartbeat at the end of the job:

```
*/5 * * * * curl -fsS -m 10 https://tanod.dev/monitor/p/<token> >/dev/null
```

   Report a failure immediately with `?status=fail`. Set the period to the job's interval and a grace a little longer than its run time.
5. For a MikroTik router, copy the generated RouterOS script (v6 or v7) into `/system script` and schedule it; the router then pushes CPU, temperature, memory and interface status every 5 minutes, and an alert fires when pushes stop.

## Limits to tell the user

- Checks run from one location; a monitor goes down after two consecutive failures. Private and CGNAT targets must use push monitoring.
- Up to 20 monitors and 5 alert channels per group; about one day of history per monitor; no SMS or email alerts; free and best effort.

## Related

Guides: https://tanod.dev/learn/cron-job-and-backup-monitoring.html and https://tanod.dev/learn/mikrotik-router-offline-alert.html
