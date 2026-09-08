# infra

Cloudflare infrastructure for `bbs.dbhq.uk`, in code.

## State is this project's alone

Its own R2 bucket, `bbs-tfstate`, and its own credential. That is not
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
anything in the configuration ends up in R2 in clear. The two Pages secrets
are set with `wrangler pages secret put` and never reach Terraform.

## What Terraform owns, and what it does not

Terraform owns the Pages **project**, the custom domain, the DNS record, the
KV namespace and the Turnstile widget.

Wrangler owns the **deployments** and the **secrets**. `lifecycle
ignore_changes` on the project keeps the two from fighting. This is the same
split the DBHQ website uses.

The zone itself belongs to the DBHQ repo. This project only adds one record
to it, and references it by id rather than managing it, because two
configurations must never both own a resource.
