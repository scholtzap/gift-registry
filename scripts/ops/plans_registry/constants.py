"""Shared constants for plans registry batch operations."""
from __future__ import annotations

# Do not auto-archive even when status/evidence would qualify.
ARCHIVE_HOLD = frozenset(
    {
        "BRAND_ALIGNMENT_3BO_MOBI_SPEC.md",
        "AWS_COST_AND_SECURITY_FOLLOWUPS_TODO.md",
        "DEVICE_ACTIVITY_TIMELINE_SPEC.md",
        "FLEET_LIVE_GROUP_SHARE_3D_SPEC.md",
        "SIMULATOR_IMPROVEMENTS_SPEC.md",
        "WHATSAPP_BOT_RELIABILITY_AND_IDENTITY_TODO.md",
    }
)

AUTO_ARCHIVE_STATUSES = frozenset({"implemented", "superseded", "cancelled"})

# Explicit P3 ranks (lower = sooner). Unlisted P3 files get heuristic ranks.
P3_EXPLICIT_RANKS: dict[str, int] = {
    # Near-ship / implementing
    "ADMIN_DEVICES_COMPACT_EDIT_AND_DEVICE_ANALYTICS_SPEC.md": 101,
    "CFG_WIZARD_ICCID_AGENT_PROMPT.md": 102,
    "wa_native_ff_contacts_SPEC.md": 103,
    "device_cfg_led_ux_alignment_SPEC.md": 104,
    "TELEMETRY_CFN_500_AND_CFG_GROUPS_OWN_SPEC.md": 105,
    # Tracker / session UX
    "tracker_hud_layout_SPEC.md": 121,
    "tracker_map_popup_readability_SPEC.md": 122,
    "tracker_basemap_toggle_SPEC.md": 123,
    "tracker_portal_glass_followup_TODO.md": 124,
    "SESSION_MODE_ASSISTANCE_TRIAGE_SPEC.md": 125,
    "LIVE_TRACKING_CHROME_ALIGNMENT_PLAN_2026-08-11.md": 126,
    "tracker_feature_flags.md": 127,
    # Crash pipeline
    "crash_detection_silent_rollout_TODO.md": 141,
    "CRASH_DETECTION_LEGAL_REVIEW.md": 142,
    "bicycle_crash_detection_RESEARCH.md": 143,
    "crash_funnel_metabase.md": 144,
    "crash_optin_vibration_sms.md": 145,
    "ATC700_BATTERY_CHARGE_CYCLE_REPORT_SPEC.md": 146,
    # CFG / hardware bench
    "tat100_prod_cfg_bench_TODO.md": 161,
    "atc700_call_wakeup_mode_TODO.md": 162,
    "notify_owner_registry_TODO.md": 163,
    "device_reports_TODO.md": 164,
    # Org / handover / portal docs
    "ORG_SCOPED_ACCESS_DECISIONS_2026-08-10.md": 181,
    "FLEET_DEVICE_TABLE_HANDOVER.md": 182,
    "portal_user_manual_multi_device_SPEC.md": 183,
    "ORPHAN_TRIAGE_2026-08-09.md": 184,
    "BRAND_ALIGNMENT_HANDOVER.md": 185,
    # WWW / simulator
    "DOWNHILL_TRACKER_SIMULATOR_SPEC.md": 201,
    "SIMULATOR_STORYLINES_AB_SPEC.md": 202,
    "WWW_INLINE_REPORTS_AND_ASSURE_TECH_SPEC.md": 203,
    "HANDOFF_FIELD_REPORTS_CF_PAGES_FOR_3BO_WWW.md": 204,
    # Admin / ops todos
    "ADMIN_ANALYTICS_IN_APP_TODO.md": 221,
    "SIMCONTROL_SHEETS_RETIREMENT.md": 222,
    "WOOCOMMERCE_ADMIN_INTEGRATION_TODO.md": 223,
    "SUBSCRIPTION_KILL_SWITCH_TODO.md": 224,
    "TODO_oci_rsync_sibling_services.md": 225,
    "SIM_ASSIGNMENT_TRUST_MODEL.md": 226,
    # Infra / reference / polish
    "INFRASTRUCTURE_MAP_2026-08-02.md": 301,
    "GSC_VERIFY_3BO_BIKE_2026-08-11.md": 302,
    "aws_account_security_cost_audit.md": 303,
    "SESSION_2026-08-26_INCIDENT_INDEX.md": 304,
    "emergency_no_gps_fix_BUGFIX_2026-08-11.md": 305,
    # WA polish
    "WA_ONBOARDING_FUNNEL_DELINK_SLEEP_2026-08-13.md": 401,
    # Hold-adjacent (still sequenced when unblocked)
    "TERRAIN_3D_TIER_AND_COST_SPEC.md": 501,
    "FLEET_LIVE_GROUP_SHARE_3D_SPEC.md": 502,
    "AWS_COST_AND_SECURITY_FOLLOWUPS_TODO.md": 503,
    "DEVICE_ACTIVITY_TIMELINE_SPEC.md": 504,
    "SIMULATOR_IMPROVEMENTS_SPEC.md": 505,
    "BRAND_ALIGNMENT_3BO_MOBI_SPEC.md": 506,
    # Likely done / low urgency
    "GUEST_FLEET_PASSCODE.md": 601,
    # Backlog / deferred
    "open_map_studio_and_share_link_SPEC.md": 701,
    "automated_sim_inventory_from_traffic.plan.md": 702,
    "tracker_and_odt_todos.plan.md": 703,
    "DOC_KB_SOT_BACKLOG.md": 750,
}

STATUS_RANK_DEFAULTS: dict[str, int] = {
    "implementing": 150,
    "spec": 250,
    "draft": 450,
    "backlog": 750,
}


def heuristic_p3_rank(filename: str, status: str) -> int:
    if filename in P3_EXPLICIT_RANKS:
        return P3_EXPLICIT_RANKS[filename]
    return STATUS_RANK_DEFAULTS.get(status, 450)


def evidence_set(evidence: object) -> bool:
    if evidence is None:
        return False
    text = str(evidence).strip()
    return text not in ("", "null", "None", "none")
