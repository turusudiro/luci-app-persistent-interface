#!/bin/sh
# Rename network interfaces based on UCI config

. /lib/functions.sh

# Cached logging flag (loaded once)
__log_enabled=""

# Log only if logging is enabled in UCI
_log() {
	local msg="$1"
	[ -z "$__log_enabled" ] && __log_enabled=$(uci -q get persistent-interface.global.logging)
	[ "$__log_enabled" = "1" ] && logger -t persistent-interface "$msg"
}

_ifrename() {
	local _iface="$1"

	# Ensure interface exists
	[ -r "/sys/class/net/$_iface/address" ] || return

	# Get and normalize MAC
	local _mac
	_mac=$(cat /sys/class/net/"$_iface"/address)
	[ -z "$_mac" ] || [ "$_mac" = "00:00:00:00:00:00" ] && return
	_mac=$(echo "$_mac" | tr 'A-F' 'a-f')

	# Try to find a matching config section
	local matched_ifname=""
	local section_name=""
	local run_script=0

	find_match() {
		local s="$1"
		local mac ifname script

		config_get mac "$s" mac
		config_get ifname "$s" ifname
		config_get script "$s" script

		[ -z "$mac" ] || [ -z "$ifname" ] && return

		mac=$(echo "$mac" | tr 'A-F' 'a-f')
		if [ "$mac" = "$_mac" ]; then
			matched_ifname="$ifname"
			section_name="$s"
			[ "$script" = "1" ] && run_script=1
			return 1 # break loop
		fi
	}

	config_load persistent-interface
	config_foreach find_match interface

	# Exit early if no match found
	[ -z "$matched_ifname" ] && return

	_log "✨ Starting _ifrename for $_iface..."
	_log "📎 Detected and normalized MAC: $_mac"
	_log "✅ MAC match in section '$section_name' → rename $_iface to $matched_ifname"

	# Rename interface
	if [ "$matched_ifname" != "$_iface" ] && ip link set "$_iface" name "$matched_ifname"; then
		_log "🎉 Renamed $_iface to $matched_ifname"

		# Run per-interface script if enabled
		if [ "$run_script" -eq 1 ]; then
			local script_path="/etc/persistent-interface/${section_name}_post_rename.sh"
			if [ -x "$script_path" ]; then
				_log "🚀 Executing per-interface script: $script_path"
				"$script_path" "$_iface" "$matched_ifname"
			else
				_log "⚠️ Script $script_path not found or not executable"
			fi
		fi

		# Defer global script
		local global_enabled global_script
		config_get global_enabled global enabled
		config_get global_script global script

		if [ "$global_enabled" = "1" ] && [ "$global_script" = "1" ]; then
			local global_path="/etc/persistent-interface/globalscript.sh"
			if [ -x "$global_path" ]; then
				_log "⏳ Scheduling global script: $global_path"
				(
					sleep 1
					_log "🌍 Executing global script: $global_path"
					"$global_path" "$_iface" "$matched_ifname" "$section_name"
				) &
			else
				_log "⚠️ Global script $global_path not found or not executable"
			fi
		fi
	else
		_log "💥 Failed to rename $_iface to $matched_ifname"
	fi
}
