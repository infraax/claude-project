#!/bin/bash
# Detects current runtime environment and exports ENV_TYPE

detect_environment() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    export ENV_TYPE="macbook"
    export ENV_LABEL="MacBook (local)"
    export ENV_PERSISTENT=true
    export ENV_PACKAGE_MGR="brew"
    export ENV_HOME="$HOME"
    return
  fi

  if [ -n "$GITHUB_ACTIONS" ]; then
    export ENV_TYPE="github-actions"
    export ENV_LABEL="GitHub Actions Runner"
    export ENV_PERSISTENT=false
    export ENV_PACKAGE_MGR="apt"
    export ENV_HOME="/home/runner"
    return
  fi

  if [ -n "$CODESPACES" ]; then
    export ENV_TYPE="codespaces"
    export ENV_LABEL="GitHub Codespaces"
    export ENV_PERSISTENT=false
    export ENV_PACKAGE_MGR="apt"
    export ENV_HOME="/home/codespace"
    return
  fi

  if [ -n "$ANTHROPIC_SANDBOX" ] || \
     [ -f /etc/claude-sandbox ] || \
     [[ "$(hostname)" == *"claude"* ]] || \
     [[ "$(hostname)" == *"sandbox"* ]]; then
    export ENV_TYPE="claude-sandbox"
    export ENV_LABEL="Claude Code Sandbox"
    export ENV_PERSISTENT=false
    export ENV_PACKAGE_MGR="apt"
    export ENV_HOME="/root"
    return
  fi

  if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    export ENV_TYPE="linux-container"
    export ENV_LABEL="Linux Container / Sandbox"
    export ENV_PERSISTENT=false
    export ENV_PACKAGE_MGR="apt"
    export ENV_HOME="/root"
    return
  fi

  export ENV_TYPE="unknown"
  export ENV_LABEL="Unknown"
  export ENV_PERSISTENT=false
  export ENV_PACKAGE_MGR="apt"
}

detect_environment

if [ "${1}" = "--print" ]; then
  echo "════════════════════════════════════"
  echo "  Environment: $ENV_LABEL"
  echo "  Type:        $ENV_TYPE"
  echo "  Persistent:  $ENV_PERSISTENT"
  echo "  Package mgr: $ENV_PACKAGE_MGR"
  echo "  Home:        $ENV_HOME"
  echo "════════════════════════════════════"
fi
