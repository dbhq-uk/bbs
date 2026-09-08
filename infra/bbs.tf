# Deploys are pushed with `wrangler pages deploy shell/dist --project-name bbs`.
# These resources manage the project and its supporting infrastructure, not the
# deployments themselves - the same split the DBHQ website uses.

resource "cloudflare_pages_project" "bbs" {
  account_id        = var.account_id
  name              = var.pages_project
  production_branch = "main"

  lifecycle {
    # Bindings, build config and secrets are managed by wrangler. Terraform
    # owning the project while wrangler owns the deployments is the
    # established pattern across this account.
    ignore_changes = [build_config, deployment_configs, source]
  }
}

resource "cloudflare_pages_domain" "bbs" {
  account_id   = var.account_id
  project_name = cloudflare_pages_project.bbs.name
  domain       = var.hostname
}

# The zone lives in the DBHQ repo's state; this only adds one record to it.
# Referencing the zone by id rather than managing it is deliberate: two
# configurations must never both own the same resource.
resource "cloudflare_record" "bbs" {
  zone_id = var.zone_id
  name    = "bbs"
  type    = "CNAME"
  content = var.pages_target
  proxied = true
  ttl     = 1
  comment = "bbs - a bulletin board that fronts the live web"
}

# Session allowances and the metering banner.
#
# Deliberately NOT the security boundary. KV is read-modify-write, so a burst
# can walk past a counter held here. The atomic rate-limit bindings that are
# the real boundary cannot live in a Pages project at all - `wrangler pages
# deploy` rejects `unsafe` bindings outright - which is tracked as issue #11
# and fixed by moving to a Worker with static assets.
resource "cloudflare_workers_kv_namespace" "quota" {
  account_id = var.account_id
  title      = "bbs-QUOTA"
}

# The challenge that upgrades a caller from a guest session to a verified one.
# Invisible: it should cost a real visitor nothing.
#
# The SECRET key is not here and must not be. Terraform state stores attributes
# verbatim, so putting it in the configuration would write it to R2 in clear.
# It is set with `wrangler pages secret put TURNSTILE_SECRET --project-name
# bbs`. The SITE key is public by design and is compiled into the client
# bundle, which is correct.
resource "cloudflare_turnstile_widget" "bbs" {
  account_id = var.account_id
  name       = var.hostname
  domains    = [var.hostname]
  mode       = "invisible"
  region     = "world"
}

# Everything above was created by hand through the API and CLI while getting
# the board deployed on 8 Sep 2026. Import blocks bring it under management
# declaratively, so the record of how it came to exist is reviewable rather
# than a run of `terraform import` commands nobody wrote down.
#
# Once an apply has run and the state holds these, the blocks are inert and can
# be removed.
import {
  to = cloudflare_pages_project.bbs
  id = "${var.account_id}/bbs"
}

import {
  to = cloudflare_pages_domain.bbs
  id = "${var.account_id}/bbs/${var.hostname}"
}

# The DNS record was created by hand too, and was missed on the first pass -
# the apply then failed with "expected DNS record to not already be present
# but already exists". Its id is zone-scoped, not account-scoped, which is
# why the format differs from the others above.
import {
  to = cloudflare_record.bbs
  id = "${var.zone_id}/806ed9512e1403729a3f1e9a1a513389"
}

import {
  to = cloudflare_workers_kv_namespace.quota
  id = "${var.account_id}/700825175cd149b09ac512fc79dc6fff"
}

import {
  to = cloudflare_turnstile_widget.bbs
  id = "${var.account_id}/0x4AAAAAAEtKtoE12KIqaRTe"
}
