# Backend configuration for this project's own R2 state bucket.
#
# Committed on purpose. Every value here is an identifier, not a credential:
# a bucket name and an account-scoped endpoint. The keys that open it come
# from 1Password at init time as AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY,
# by way of `source ~/.dbhq/env.sh`, and are never written to disk.
#
# The bucket is bbs's alone. Sharing state with the DBHQ website is what let a
# plan here propose destroying modem.dbhq.uk, because the shared state held
# resources this configuration knows nothing about.
#
#   terraform init -backend-config=backend.hcl

bucket = "dbhq-bbs-tfstate"
key    = "bbs.tfstate"

endpoints = { s3 = "https://691c21cdcf1b3fa4add70cc166e99733.r2.cloudflarestorage.com" }

# R2 has no regions, but the S3 client refuses to start without one. `auto` is
# what Cloudflare document.
region = "auto"

# R2 is S3-compatible, not S3. Each of these switches off a check that assumes
# a real AWS endpoint on the other end, and each one fails the init without it.
skip_credentials_validation = true
skip_region_validation      = true
skip_requesting_account_id  = true
skip_s3_checksum            = true
use_path_style              = true
