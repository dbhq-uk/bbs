# The board is a Worker with static assets, pushed with `wrangler deploy`.
# These resources manage the hostname and supporting infrastructure, not the
# deployments themselves - the same split the DBHQ website uses.

# A Worker custom domain, not a DNS record.
#
# Cloudflare owns the record behind this: attaching the hostname creates the
# proxied record and the certificate, and detaching removes them. That is why
# there is no cloudflare_record here any more - one existed for the Pages
# CNAME, and leaving it would collide with the record Cloudflare manages.
resource "cloudflare_workers_domain" "bbs" {
  account_id  = var.account_id
  zone_id     = var.zone_id
  hostname    = var.hostname
  service     = var.worker_name
  environment = "production"
}

# Session allowances and the metering banner.
#
# Also holds the `sess:<sub>` records that carry a caller's level and flags,
# which is the half of a session a signed token is not: a token without its
# record verifies perfectly and is then refused at the gate.
#
# Deliberately NOT the rate-limit boundary. KV is read-modify-write, so a
# burst walks past a counter held here. The atomic rate-limit bindings that
# are the real boundary live in wrangler.toml, and could not exist at all
# while this was a Pages project.
resource "cloudflare_workers_kv_namespace" "quota" {
  account_id = var.account_id
  title      = "bbs-QUOTA"
}

# The challenge taken at the door. Invisible: it should cost a real visitor
# nothing, and a failed challenge does not refuse the caller - the guest tier
# is bounded by the gate and the limiters, not by this.
#
# The SECRET key is not here and must not be. Terraform state stores
# attributes verbatim, so putting it in the configuration would write it to R2
# in clear. It is set with `wrangler secret put TURNSTILE_SECRET`. The SITE key
# is public by design and is compiled into the client bundle, which is correct.
resource "cloudflare_turnstile_widget" "bbs" {
  account_id = var.account_id
  name       = var.hostname
  domains    = [var.hostname]
  mode       = "invisible"
  region     = "world"
}

# The KV namespace and Turnstile widget were created by hand through the API
# and CLI while getting the board deployed on 8 Sep 2026; the Worker custom
# domain was created during the migration off Pages on 9 Sep 2026. Import
# blocks bring them under management declaratively, so the record of how they
# came to exist is reviewable rather than a run of `terraform import` commands
# nobody wrote down.
#
# Once an apply has run and the state holds these, the blocks are inert and
# can be removed.
import {
  to = cloudflare_workers_domain.bbs
  id = "${var.account_id}/792bc3802efb8f8c03161a85fe85e825cc001279"
}

import {
  to = cloudflare_workers_kv_namespace.quota
  id = "${var.account_id}/700825175cd149b09ac512fc79dc6fff"
}

import {
  to = cloudflare_turnstile_widget.bbs
  id = "${var.account_id}/0x4AAAAAAEtKtoE12KIqaRTe"
}

# THE PAGES ERA, ENDED 9 SEP 2026.
#
# The board ran on Cloudflare Pages until it needed atomic rate-limit
# bindings, which a Pages project cannot hold: `wrangler pages deploy` rejects
# `unsafe` bindings outright, and the REST API accepts the binding and
# silently discards it. See issue #11 and worker/index.ts.
#
# `destroy = false` on all three, for different reasons:
#
#   - the domain and the DNS record were already deleted through the API
#     during the cutover, so there is nothing left to destroy and asking
#     Terraform to try would only produce a 404.
#
#   - the Pages PROJECT still exists and is deliberately left alone. It is
#     the rollback path: it holds every previous deployment, so if the Worker
#     turns out to be wrong, re-attaching the custom domain to it is one API
#     call. Deleting it throws that away. It serves no traffic and costs
#     nothing while it sits there.
#
# Delete the project once the Worker has proven itself, and drop this block.
removed {
  from = cloudflare_pages_project.bbs
  lifecycle { destroy = false }
}

removed {
  from = cloudflare_pages_domain.bbs
  lifecycle { destroy = false }
}

removed {
  from = cloudflare_record.bbs
  lifecycle { destroy = false }
}
