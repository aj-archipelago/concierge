#!/bin/bash

# Branch cleanup script
# This script will:
# 1. Delete all branches merged into dev (except protected ones)
# 2. Prune stale remote tracking branches

set -e

# Branches to keep (unmerged or important)
KEEP_BRANCHES=(
    "dev"
    "main"
    "ARC-2572"
    "jmac_add_guide"
    "jmac_add_html_workspace"
    "jmac_dev_with_youtube_subtitles"
    "jmac_differential_applet"
    "jmac_en_plus_file"
    "jmac_file_dry"
    "jmac_fix_bad_signal_alt"
    "jmac_fix_padding"
    "jmac_fix_run_workspace"
    "jmac_fix_signal_errors"
    "jmac_improve_screenshot"
    "jmac_mobile_zoom"
    "jmac_replace_filepond"
    "jmac_supafast_applet"
    "jmac_temp_message_render"
    "jmac_validate_contextid"
    "jmac_youtube_subtitles"
)

echo "=== Branch Cleanup Script ==="
echo ""
echo "This script will:"
echo "  1. Delete branches merged into 'dev' (except protected branches)"
echo "  2. Prune stale remote tracking branches from origin"
echo ""

# Function to check if a branch should be kept
should_keep() {
    local branch=$1
    for keep in "${KEEP_BRANCHES[@]}"; do
        if [ "$branch" = "$keep" ]; then
            return 0
        fi
    done
    return 1
}

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"
echo ""

# Step 1: Find merged branches to delete
echo "=== Step 1: Finding merged branches to delete ==="
MERGED_BRANCHES=()
while IFS= read -r branch; do
    branch=$(echo "$branch" | sed 's/^  //' | sed 's/^* //')
    if [ -z "$branch" ] || [ "$branch" = "dev" ] || [ "$branch" = "main" ]; then
        continue
    fi
    if ! should_keep "$branch"; then
        MERGED_BRANCHES+=("$branch")
    fi
done < <(git branch --merged dev)

echo "Found ${#MERGED_BRANCHES[@]} merged branches to delete:"
for branch in "${MERGED_BRANCHES[@]}"; do
    echo "  - $branch"
done
echo ""

# Step 2: Prune stale remote branches
echo "=== Step 2: Checking stale remote branches ==="
STALE_COUNT=$(git remote prune origin --dry-run 2>&1 | grep -c "would prune" || echo "0")
echo "Found $STALE_COUNT stale remote tracking branches to prune"
echo ""

# Confirmation
echo "=== Summary ==="
echo "  - Will delete ${#MERGED_BRANCHES[@]} local merged branches"
echo "  - Will prune $STALE_COUNT stale remote tracking branches"
echo "  - Will keep ${#KEEP_BRANCHES[@]} protected branches"
echo ""
read -p "Continue? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# Delete merged branches
echo ""
echo "=== Deleting merged branches ==="
DELETED=0
FAILED=0
for branch in "${MERGED_BRANCHES[@]}"; do
    if git branch -d "$branch" 2>/dev/null; then
        echo "  ✓ Deleted: $branch"
        ((DELETED++))
    else
        echo "  ✗ Failed to delete: $branch (may need -D to force)"
        ((FAILED++))
    fi
done

# Prune stale remote branches
echo ""
echo "=== Pruning stale remote branches ==="
git remote prune origin

echo ""
echo "=== Cleanup Complete ==="
echo "  - Deleted: $DELETED branches"
if [ $FAILED -gt 0 ]; then
    echo "  - Failed: $FAILED branches (may need force delete)"
fi
echo "  - Pruned stale remote branches"
echo ""
echo "Remaining branches:"
git branch

