variable "cloudflare_api_token" {
  description = "Cloudflare API token. From TF_VAR_cloudflare_api_token, sourced from 1Password by ~/.dbhq/env.sh. Never has a default."
  type        = string
  sensitive   = true
}

variable "account_id" {
  description = "Cloudflare account id. An identifier, not a credential."
  type        = string
  default     = "691c21cdcf1b3fa4add70cc166e99733"
}

variable "zone_id" {
  description = "Zone id for dbhq.uk. The zone itself is managed by the DBHQ repo; this project only adds a record to it."
  type        = string
  default     = "48bb46832a2853526a1082accdac4147"
}

variable "hostname" {
  description = "Where the board lives."
  type        = string
  default     = "bbs.dbhq.uk"
}

variable "worker_name" {
  description = "The Worker script name. `wrangler deploy` creates and updates the script; Terraform only attaches the hostname to it."
  type        = string
  default     = "bbs"
}
