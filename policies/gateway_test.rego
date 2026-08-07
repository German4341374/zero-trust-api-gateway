package gateway_test

import data.gateway.decision
import rego.v1

test_profile_is_allowed if {
  decision with input as {
    "method": "GET",
    "path": "/api/profile",
    "identity": {"subject": "user-1", "roles": ["viewer"], "tenant": "acme"},
  } == {"allow": true, "reason": "authenticated_profile_read"}
}

test_admin_requires_role if {
  decision with input as {
    "method": "GET",
    "path": "/api/admin",
    "identity": {"subject": "user-1", "roles": ["viewer"], "tenant": "acme"},
  } == {"allow": false, "reason": "no_matching_policy"}
}

test_admin_role_is_allowed if {
  decision with input as {
    "method": "GET",
    "path": "/api/admin",
    "identity": {"subject": "user-2", "roles": ["admin"], "tenant": "acme"},
  } == {"allow": true, "reason": "admin_role_required"}
}

test_cross_tenant_is_denied if {
  decision with input as {
    "method": "GET",
    "path": "/api/tenants/other/orders",
    "identity": {"subject": "user-1", "roles": ["viewer"], "tenant": "acme"},
  } == {"allow": false, "reason": "no_matching_policy"}
}

test_own_tenant_is_allowed if {
  decision with input as {
    "method": "GET",
    "path": "/api/tenants/acme/orders",
    "identity": {"subject": "user-1", "roles": ["viewer"], "tenant": "acme"},
  } == {"allow": true, "reason": "tenant_boundary_matched"}
}

