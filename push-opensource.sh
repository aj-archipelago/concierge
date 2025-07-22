#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
CONCIERGE_REPO="git@github.com:aj-archipelago/concierge.git"
REMOTE_NAME="opensource"
SOURCE_BRANCH="dev"
TARGET_BRANCH="main"
CONFIG_FILE="app.config/config/index.js"
CONFIG_URL="https://raw.githubusercontent.com/aj-archipelago/concierge/main/app.config/config/index.js"

# Generate default temp branch name based on current date
DEFAULT_TEMP_BRANCH=$(date +"%b%d" | tr '[:upper:]' '[:lower:]')

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${PURPLE}[STEP]${NC} $1"
}

# Error handling
set -e
trap 'log_error "An error occurred. Exiting."; exit 1' ERR

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if we're in a git repository
check_git_repo() {
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        log_error "Not in a git repository. Please run this script from the labeeb repository root."
        exit 1
    fi
}

# Function to check if remote exists
remote_exists() {
    git remote get-url "$REMOTE_NAME" >/dev/null 2>&1
}

# Function to get user confirmation
confirm() {
    local message="$1"
    echo -e "${CYAN}$message${NC}"
    read -p "Continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_warning "Operation cancelled by user."
        exit 0
    fi
}

# Function to get version from package.json
get_version() {
    if [[ -f "package.json" ]]; then
        # Try to use node to parse JSON (most reliable)
        if command_exists node; then
            VERSION=$(node -p "require('./package.json').version" 2>/dev/null)
        else
            # Fallback to grep/sed if node is not available
            VERSION=$(grep '"version"' package.json | sed 's/.*"version": *"\([^"]*\)".*/\1/')
        fi
        
        if [[ -n "$VERSION" ]]; then
            log_info "Found version: $VERSION"
        else
            log_warning "Could not extract version from package.json, using 'unknown'"
            VERSION="unknown"
        fi
    else
        log_warning "package.json not found, using 'unknown' version"
        VERSION="unknown"
    fi
}

# Function to get temp branch name from user
get_temp_branch_name() {
    echo -e "${CYAN}Enter temporary branch name (default: $DEFAULT_TEMP_BRANCH):${NC}"
    read -p "Branch name: " -r
    if [[ -z "$REPLY" ]]; then
        TEMP_BRANCH="$DEFAULT_TEMP_BRANCH"
        log_info "Using default branch name: $TEMP_BRANCH"
    else
        TEMP_BRANCH="$REPLY"
        log_info "Using custom branch name: $TEMP_BRANCH"
    fi
    
    # Validate branch name (basic validation)
    if [[ ! "$TEMP_BRANCH" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        log_error "Invalid branch name. Only letters, numbers, hyphens, and underscores are allowed."
        exit 1
    fi
}

# Function to check current branch
check_current_branch() {
    local current_branch=$(git branch --show-current)
    log_info "Current branch: $current_branch"
    
    if [[ "$current_branch" != "$SOURCE_BRANCH" ]]; then
        log_warning "You are not on the $SOURCE_BRANCH branch. Current branch: $current_branch"
        confirm "Do you want to switch to $SOURCE_BRANCH branch?"
        git checkout "$SOURCE_BRANCH"
        log_success "Switched to $SOURCE_BRANCH branch"
    fi
}

# Function to check for uncommitted changes
check_uncommitted_changes() {
    if ! git diff-index --quiet HEAD --; then
        log_warning "You have uncommitted changes in your working directory."
        git status --short
        confirm "Do you want to continue with uncommitted changes?"
    fi
}

# Main script
main() {
    log_step "Starting push to opensource process..."
    
    # Check prerequisites
    if ! command_exists git; then
        log_error "Git is not installed. Please install git first."
        exit 1
    fi
    
    if ! command_exists curl; then
        log_error "curl is not installed. Please install curl first."
        exit 1
    fi
    
    check_git_repo
    check_current_branch
    check_uncommitted_changes
    
    # Get version from package.json
    get_version
    
    # Get temp branch name from user
    get_temp_branch_name
    
    log_step "1. Adding remote to concierge repo..."
    
    if remote_exists; then
        log_info "Remote '$REMOTE_NAME' already exists."
        local remote_url=$(git remote get-url "$REMOTE_NAME")
        if [[ "$remote_url" != "$CONCIERGE_REPO" ]]; then
            log_warning "Remote '$REMOTE_NAME' exists but points to different URL: $remote_url"
            echo -e "${CYAN}Do you want to update it to point to $CONCIERGE_REPO?${NC}"
            read -p "Continue? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                git remote set-url "$REMOTE_NAME" "$CONCIERGE_REPO"
                log_success "Updated remote URL"
            else
                log_info "Keeping existing remote URL: $remote_url"
            fi
        fi
    else
        git remote add "$REMOTE_NAME" "$CONCIERGE_REPO"
        log_success "Added remote '$REMOTE_NAME'"
    fi
    
    log_step "2. Pulling concierge's main branch to temporary local branch..."
    
    # Check if temp branch already exists
    if git show-ref --verify --quiet refs/heads/"$TEMP_BRANCH"; then
        log_warning "Branch '$TEMP_BRANCH' already exists locally."
        confirm "Do you want to delete the existing branch and recreate it?"
        git branch -D "$TEMP_BRANCH"
        log_success "Deleted existing branch '$TEMP_BRANCH'"
    fi
    
    git fetch "$REMOTE_NAME" "$TARGET_BRANCH:$TEMP_BRANCH"
    log_success "Fetched $TARGET_BRANCH to local branch '$TEMP_BRANCH'"
    
    git checkout "$TEMP_BRANCH"
    log_success "Checked out branch '$TEMP_BRANCH'"
    
    log_step "3. Merging $SOURCE_BRANCH into $TEMP_BRANCH..."
    
    # Check if merge is needed
    if git merge-base --is-ancestor "$SOURCE_BRANCH" "$TEMP_BRANCH" 2>/dev/null; then
        log_info "$SOURCE_BRANCH is already merged into $TEMP_BRANCH"
    else
        # Perform merge with strategy to prefer dev branch changes
        if ! git merge "$SOURCE_BRANCH" --strategy=recursive --strategy-option=theirs; then
            log_warning "Merge had conflicts. Resolving by taking dev branch version for all conflicts..."
            
            # Show current git status for debugging
            git status --porcelain
            
            # First, try to resolve conflicts using git checkout --theirs for files that exist
            git checkout --theirs . 2>/dev/null || true
            
            # Get list of unmerged files and resolve them
            unmerged_files=$(git ls-files -u | cut -f2 | sort -u)
            if [[ -n "$unmerged_files" ]]; then
                while IFS= read -r file; do
                    if [[ -n "$file" ]]; then
                        log_info "Resolving unmerged file: $file"
                        # Add the file from the dev branch (this stages the current version)
                        git add "$file"
                    fi
                done <<< "$unmerged_files"
            fi
            
            # Stage all other changes
            git add -A
            
            # Complete the merge
            git commit --no-edit
            log_success "Resolved merge conflicts"
        else
            log_success "Merged $SOURCE_BRANCH into $TEMP_BRANCH"
        fi
    fi
    
    log_step "4. Cleaning up app.config directory to only contain index.js..."
    
    # First, remove all files in app.config except index.js
    find app.config -type f -not -name "index.js" -not -path "*/\.*" | while read -r file; do
        log_info "Removing file: $file"
        git rm "$file" 2>/dev/null || rm "$file"
    done
    
    # Remove empty directories
    find app.config -type d -empty -not -path "app.config" -not -path "app.config/config" | while read -r dir; do
        log_info "Removing empty directory: $dir"
        rmdir "$dir" 2>/dev/null || true
    done
    
    # Ensure app.config/config directory exists
    mkdir -p app.config/config
    
    # Download the vanilla config file from GitHub
    if curl -s -o "$CONFIG_FILE" "$CONFIG_URL"; then
        log_success "Downloaded vanilla config file from GitHub"
    else
        log_error "Failed to download config file from GitHub"
        log_info "Creating minimal config file..."
        cat > "$CONFIG_FILE" << 'EOF'
module.exports = {
  // Empty configuration
};
EOF
        log_success "Created minimal config file"
    fi
    
    # Stage all changes in app.config
    git add app.config/
    
    # Commit the cleanup and config reset
    git commit -m "Clean up app.config directory - keep only vanilla index.js"
    log_success "Committed app.config cleanup and reset"
    
    log_step "5. Pushing to concierge repo..."
    
    confirm "Ready to push branch '$TEMP_BRANCH' to remote '$REMOTE_NAME'?"
    
    git push "$REMOTE_NAME" "$TEMP_BRANCH"
    log_success "Pushed branch '$TEMP_BRANCH' to remote '$REMOTE_NAME'"
    
    log_step "6. Creating Pull Request..."
    
    # Generate PR URL with default title and description
    local pr_title="Update from dev branch v$VERSION"
    local pr_body="This PR merges the latest changes from the dev branch into the open source version.

Changes:
- Merged latest development changes
- Cleaned up app.config directory  
- Reset configuration to vanilla state

Please review the changes and ensure all configurations are appropriate for the open source version."
    
    # No encoding - keep it simple
    local pr_url="https://github.com/aj-archipelago/concierge/compare/$TARGET_BRANCH...$TEMP_BRANCH?title=$pr_title&body=$pr_body&labels=sync,dev-merge"
    
    log_success "Branch '$TEMP_BRANCH' has been pushed successfully!"
    log_info "To create a Pull Request, visit:"
    echo -e "${CYAN}$pr_url${NC}"
    
    # Try to open the URL in browser if possible
    if command_exists open; then
        confirm "Do you want to open the PR creation page in your browser?"
        open "$pr_url"
    elif command_exists xdg-open; then
        confirm "Do you want to open the PR creation page in your browser?"
        xdg-open "$pr_url"
    fi
    
    log_success "Push to opensource process completed successfully!"
    
    log_info "You can now switch back to your original branch:"
    echo -e "${CYAN}git checkout $SOURCE_BRANCH${NC}"
}

# Run main function
main "$@" 