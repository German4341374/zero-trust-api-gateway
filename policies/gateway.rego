package gateway

import rego.v1

default allow := false
default reason := "no_matching_policy"

is_profile if {
  input.method == "GET"
  input.path == "/api/profile"
}

is_admin if {
  input.method == "GET"
  input.path == "/api/admin"
  "admin" in input.identity.roles
}

tenant_segments := split(trim(input.path, "/"), "/")

is_own_tenant if {
  input.method == "GET"
  count(tenant_segments) == 4
  tenant_segments[0] == "api"
  tenant_segments[1] == "tenants"
  tenant_segments[3] == "orders"
  input.identity.tenant == tenant_segments[2]
}

allow if is_profile
allow if is_admin
allow if is_own_tenant

reason := "authenticated_profile_read" if is_profile
reason := "admin_role_required" if is_admin
reason := "tenant_boundary_matched" if is_own_tenant

decision := {
  "allow": allow,
  "reason": reason,
}

