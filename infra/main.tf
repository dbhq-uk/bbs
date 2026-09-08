# The infrastructure behind bbs.dbhq.uk.
#
# WHAT IS AND IS NOT A SECRET, because the distinction decides what may live
# in a public repository and getting it wrong in either direction is
# expensive.
#
#   NOT SECRET, and deliberately committed:
#     account id, zone id, hostnames, KV namespace ids, the Turnstile SITE
#     key. These are identifiers. They appear in every API call the account
#     makes and in the client bundle, and treating an identifier as a secret
#     buys nothing while costing the reader the ability to understand what is
#     deployed.
#
#   SECRET, and never in this repository in any form:
#     API tokens, SESSION_SECRET, and the Turnstile SECRET key. The first is
#     supplied as TF_VAR_* at apply time from 1Password; the other two are set
#     with `wrangler pages secret put` and deliberately never reach Terraform,
#     because state stores attributes verbatim.
#
#   THE ACTUAL RISK, which is neither of those:
#     terraform state. It must never be in git, public OR private. It lives in
#     R2, below.
#
# STATE IS THIS PROJECT'S ALONE, and that is the point.
#
# This started in the DBHQ repo's shared state alongside the website. A plan
# from there came back "4 to import, 1 to add, 3 to destroy", and the three
# destroys were modem.dbhq.uk's Pages project, domain and DNS record - present
# in the shared state, absent from the configuration on that branch. Applying
# would have deleted another project's infrastructure.
#
# Separate state per project makes that impossible rather than merely
# discouraged: this configuration cannot see modem's resources, so it can
# never plan to destroy them. heliograph already did it this way, in its own
# repo with its own bucket, and this follows that.
terraform {
  required_version = ">= 1.6"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.20"
    }
  }

  # Configured at init from backend.hcl:
  #   terraform init -backend-config=backend.hcl
  backend "s3" {}
}

provider "cloudflare" {
  # From TF_VAR_cloudflare_api_token. Never a default, never written here.
  api_token = var.cloudflare_api_token
}
