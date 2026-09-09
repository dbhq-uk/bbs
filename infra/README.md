# infra

Cloudflare infrastructure for `bbs.dbhq.uk`, in code.

## State is this project's alone

Its own R2 bucket, `dbhq-bbs-tfstate`, and its own credential. That is not
tidiness. This configuration originally lived in the DBHQ repo's shared
state, and a plan from there proposed **destroying `modem.dbhq.uk`'s Pages
project, domain and DNS record** - resources present in the shared state but
absent from the configuration on that branch. Separate state makes that
impossible rather than merely discouraged: this configuration cannot see
another project's resources, so it can never plan to remove them.

`heliograph` already worked this way. This follows it.

## Running it

```bash
source ~/.dbhq/env.sh              # Cloudflare + R2 keys, from 1Password
cd infra
terraform init -backend-config=backend.hcl
terraform plan
```

The `-backend-config` is not optional. Without it Terraform silently
initialises a **different** state file and then plans to create
infrastructure that already exists.

## What is and is not a secret

**Committed, because they are identifiers rather than credentials:** account
id, zone id, hostnames, KV namespace ids, and the Turnstile **site** key. The
site key ships in the client bundle by design.

**Never here, in any form:** the Cloudflare API token, `SESSION_SECRET`, and
the Turnstile **secret** key. Terraform state stores attributes verbatim, so
anything in the configuration ends up in R2 in clear. All three Worker secrets
- `SESSION_SECRET`, `TURNSTILE_SECRET` and `RESEND_API_KEY` - are set with
`wrangler secret put` and never reach Terraform.

## What Terraform owns, and what it does not

Terraform owns the Worker **custom domain**, the KV namespace and the
Turnstile widget.

Wrangler owns the **script**, the **deployments** and the **secrets**. This is
the same split the DBHQ website uses.

There is deliberately no `cloudflare_record` here. Attaching a custom domain
to a Worker makes Cloudflare create the proxied record and the certificate
itself, and detaching removes them; a record managed alongside it would
collide with the one Cloudflare owns. The Pages era did need one, for the
CNAME to `pages.dev`.

The zone itself belongs to the DBHQ repo. This project only adds to it, and
references it by id rather than managing it, because two configurations must
never both own a resource.

## The move off Pages, 9 Sep 2026

The board ran on Cloudflare Pages until it needed atomic rate-limit bindings.
A Pages project cannot hold one: `wrangler pages deploy` rejects `unsafe`
bindings outright, and the REST API is worse than a refusal - PATCHing the
binding onto the project returns success and silently discards it. Without
them the limiter falls back to KV counters, which are read-modify-write and
so bypassed by exactly the burst they exist to stop.

The Pages project still exists and is intentionally left in place, no longer
managed by Terraform. It holds every previous deployment, so it is the
rollback path: re-attaching the custom domain to it is one API call. Delete it
once the Worker has proven itself.
