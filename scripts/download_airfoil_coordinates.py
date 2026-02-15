#!/usr/bin/env python3
"""
Download airfoil coordinate data files in Selig format (.dat files) from airfoiltools.com

Usage:
    # Download a single airfoil
    python download_airfoil_coordinates.py ag16-il
    
    # Download multiple airfoils from a list
    python download_airfoil_coordinates.py ag16-il e325-il naca0012-il
    
    # Download from a text file (one airfoil name per line)
    python download_airfoil_coordinates.py --file airfoil_list.txt
    
    # Download ALL airfoils (discovers and downloads all available)
    python download_airfoil_coordinates.py --all
    
    # Specify output directory
    python download_airfoil_coordinates.py ag16-il --output ./airfoil_coordinates
"""

import argparse
import html.parser
import os
import re
import sys
import time
from pathlib import Path
from typing import List, Optional, Set
from urllib.error import HTTPError, URLError
from urllib.request import urlopen, Request
from urllib.parse import quote, urljoin


BASE_URL = "http://airfoiltools.com/airfoil/seligdatfile"
SEARCH_URL = "http://airfoiltools.com/search/index"
ALL_AIRFOILS_URL = "http://airfoiltools.com/search/airfoils"  # Complete list of all 1638 airfoils
DEFAULT_OUTPUT_DIR = "airfoil_coordinates"
REQUEST_DELAY = 0.5  # Delay between requests to be respectful to the server


def sanitize_filename(name: str) -> str:
    """Sanitize airfoil name for use as filename."""
    # Replace invalid filename characters
    invalid_chars = '<>:"/\\|?*'
    for char in invalid_chars:
        name = name.replace(char, '_')
    return name.strip()


def download_airfoil(airfoil_name: str, output_dir: Path, retries: int = 3) -> bool:
    """
    Download a single airfoil coordinate file.
    
    Args:
        airfoil_name: Name of the airfoil (e.g., 'ag16-il', 'e325-il')
        output_dir: Directory to save the file
        retries: Number of retry attempts on failure
        
    Returns:
        True if successful, False otherwise
    """
    # Create output directory if it doesn't exist
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Build URL
    encoded_name = quote(airfoil_name)
    url = f"{BASE_URL}?airfoil={encoded_name}"
    
    # Generate filename
    filename = f"{sanitize_filename(airfoil_name)}.dat"
    filepath = output_dir / filename
    
    # Skip if file already exists
    if filepath.exists():
        print(f"⏭️  Skipping {airfoil_name} (already exists: {filename})")
        return True
    
    # Attempt download with retries
    for attempt in range(1, retries + 1):
        try:
            # Create request with user agent
            req = Request(url)
            req.add_header('User-Agent', 'Mozilla/5.0 (Python Airfoil Downloader)')
            
            # Download file
            with urlopen(req, timeout=10) as response:
                # Check if we got valid data
                content = response.read()
                
                # Check if response is HTML (error page) instead of data
                if content.startswith(b'<!DOCTYPE') or content.startswith(b'<html'):
                    print(f"❌ {airfoil_name}: Airfoil not found or invalid")
                    return False
                
                # Save file
                with open(filepath, 'wb') as f:
                    f.write(content)
                
                print(f"✓ Downloaded {airfoil_name} → {filename}")
                return True
                
        except HTTPError as e:
            if e.code == 404:
                print(f"❌ {airfoil_name}: Airfoil not found (404)")
                return False
            elif attempt < retries:
                print(f"⚠️  {airfoil_name}: HTTP error {e.code}, retrying... ({attempt}/{retries})")
                time.sleep(REQUEST_DELAY * attempt)
                continue
            else:
                print(f"❌ {airfoil_name}: HTTP error {e.code} after {retries} attempts")
                return False
                
        except URLError as e:
            if attempt < retries:
                print(f"⚠️  {airfoil_name}: Network error, retrying... ({attempt}/{retries})")
                time.sleep(REQUEST_DELAY * attempt)
                continue
            else:
                print(f"❌ {airfoil_name}: Network error: {e.reason}")
                return False
                
        except Exception as e:
            if attempt < retries:
                print(f"⚠️  {airfoil_name}: Error {type(e).__name__}, retrying... ({attempt}/{retries})")
                time.sleep(REQUEST_DELAY * attempt)
                continue
            else:
                print(f"❌ {airfoil_name}: Unexpected error: {e}")
                return False
    
    return False


def read_airfoil_list(filepath: Path) -> List[str]:
    """Read airfoil names from a text file (one per line)."""
    airfoils = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                # Skip empty lines and comments
                if line and not line.startswith('#'):
                    airfoils.append(line)
        return airfoils
    except FileNotFoundError:
        print(f"❌ Error: File not found: {filepath}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error reading file {filepath}: {e}")
        sys.exit(1)


class AirfoilListParser(html.parser.HTMLParser):
    """HTML parser to extract airfoil names from the search page."""
    
    def __init__(self):
        super().__init__()
        self.airfoils: Set[str] = set()
        self.in_link = False
        self.current_href = ""
    
    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            for attr_name, attr_value in attrs:
                if attr_name == 'href':
                    self.current_href = attr_value or ""
                    # Look for links to airfoil pages
                    if 'airfoil' in self.current_href and 'seligdatfile' not in self.current_href:
                        self.in_link = True
                        break
    
    def handle_endtag(self, tag):
        if tag == 'a':
            self.in_link = False
            self.current_href = ""
    
    def handle_data(self, data):
        if self.in_link and self.current_href:
            # Extract airfoil name from href or text
            # Pattern: /airfoil/details?airfoil=airfoil-name
            match = re.search(r'airfoil=([^&]+)', self.current_href)
            if match:
                airfoil_name = match.group(1)
                # Only add if it looks like a valid airfoil name
                if airfoil_name and len(airfoil_name) > 1:
                    self.airfoils.add(airfoil_name)
            # Also check the link text
            text = data.strip()
            if text and len(text) > 1 and len(text) < 50:
                # Try to extract from text if it looks like an airfoil name
                if re.match(r'^[a-zA-Z0-9\-_]+$', text):
                    self.airfoils.add(text)


def discover_all_airfoils(max_pages: int = 100, save_to_file: Optional[Path] = None) -> List[str]:
    """
    Discover all available airfoils from airfoiltools.com.
    
    Scrapes the complete airfoils list page at http://airfoiltools.com/search/airfoils
    which contains all 1638 airfoils in the database.
    
    Args:
        max_pages: Not used (kept for compatibility)
        save_to_file: Optional path to save the discovered list
        
    Returns:
        List of airfoil names
    """
    print("🔍 Discovering all available airfoils from airfoiltools.com...")
    print(f"   Scraping complete list from: {ALL_AIRFOILS_URL}")
    
    all_airfoils: Set[str] = set()
    
    try:
        # Scrape the complete airfoils list page
        req = Request(ALL_AIRFOILS_URL)
        req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36')
        
        print("   Downloading page...")
        with urlopen(req, timeout=30) as response:
            html_content = response.read().decode('utf-8', errors='ignore')
            
            print("   Extracting airfoil names...")
            
            # Primary pattern: Extract from links like /airfoil/details?airfoil=airfoil-name
            # This is the most reliable pattern from the page structure
            pattern = r'/airfoil/details\?airfoil=([^"\'&\s<>"\'\)]+)'
            matches = re.findall(pattern, html_content, re.IGNORECASE)
            
            for match in matches:
                # Clean up the match
                airfoil_name = match.strip()
                # Remove any trailing characters that might have been captured
                airfoil_name = airfoil_name.split('"')[0].split("'")[0].split(')')[0].split('(')[0]
                # Validate it looks like an airfoil name
                if airfoil_name and 2 <= len(airfoil_name) <= 100:
                    # Should contain alphanumeric, hyphens, underscores, dots
                    if re.match(r'^[a-zA-Z0-9\-_\.]+$', airfoil_name):
                        all_airfoils.add(airfoil_name)
            
            # Also try the HTML parser as a backup
            parser = AirfoilListParser()
            parser.feed(html_content)
            all_airfoils.update(parser.airfoils)
            
            # Additional patterns to catch any missed airfoils
            additional_patterns = [
                r'seligdatfile\?airfoil=([^"\'&\s<>]+)',
                r'airfoil=([a-zA-Z0-9\-_\.]+-il)',
            ]
            
            for pattern in additional_patterns:
                matches = re.findall(pattern, html_content, re.IGNORECASE)
                for match in matches:
                    if match and 2 <= len(match) <= 100:
                        match = match.strip()
                        if re.match(r'^[a-zA-Z0-9\-_\.]+$', match):
                            all_airfoils.add(match)
            
            print(f"   Found {len(all_airfoils)} unique airfoils")
            
    except HTTPError as e:
        print(f"❌ Error: HTTP {e.code} when accessing {ALL_AIRFOILS_URL}")
        print(f"   {e.reason}")
        sys.exit(1)
    except URLError as e:
        print(f"❌ Error: Could not access {ALL_AIRFOILS_URL}")
        print(f"   {e.reason}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error scraping airfoils list: {e}")
        print(f"   Type: {type(e).__name__}")
        sys.exit(1)
    
    # Convert to sorted list
    airfoil_list = sorted(list(all_airfoils))
    
    if len(airfoil_list) == 0:
        print("❌ Error: No airfoils discovered. The page structure may have changed.")
        sys.exit(1)
    
    print(f"✓ Successfully discovered {len(airfoil_list)} airfoils")
    print(f"   Expected: ~1638 airfoils (as stated on the website)")
    
    if len(airfoil_list) < 1500:
        print("⚠️  Warning: Found fewer airfoils than expected.")
        print("   The page structure may have changed or some airfoils may have been missed.")
    
    # Save to file if requested
    if save_to_file:
        try:
            save_to_file.parent.mkdir(parents=True, exist_ok=True)
            with open(save_to_file, 'w', encoding='utf-8') as f:
                for airfoil in airfoil_list:
                    f.write(f"{airfoil}\n")
            print(f"💾 Saved discovered airfoil list to: {save_to_file}")
        except Exception as e:
            print(f"⚠️  Warning: Could not save list to file: {e}")
    
    return airfoil_list


def discover_airfoils_by_brute_force(known_airfoils: List[str] = None) -> List[str]:
    """
    Alternative discovery method: try to discover airfoils by testing common patterns.
    This is slower but more reliable if the search page structure changes.
    """
    print("🔍 Using brute-force discovery method...")
    print("   Testing common airfoil name patterns (this will take a while)...")
    
    discovered: Set[str] = set()
    
    # Start with known airfoils
    if known_airfoils:
        discovered.update(known_airfoils)
    
    # Common patterns to try
    patterns_to_test = []
    
    # NACA 4-digit series
    for i in range(0, 10):
        for j in range(0, 10):
            for k in range(0, 10):
                for l in range(0, 10):
                    patterns_to_test.append(f"naca{i}{j}{k}{l}-il")
                    if len(patterns_to_test) > 1000:  # Limit initial batch
                        break
                if len(patterns_to_test) > 1000:
                    break
            if len(patterns_to_test) > 1000:
                break
        if len(patterns_to_test) > 1000:
            break
    
    # Common single-letter prefixes
    for letter in 'abcdefghijklmnopqrstuvwxyz':
        for num in range(1, 1000):
            patterns_to_test.append(f"{letter}{num}-il")
            if len(patterns_to_test) > 5000:
                break
        if len(patterns_to_test) > 5000:
            break
    
    print(f"   Testing {len(patterns_to_test)} potential airfoil names...")
    print("   (This is a simplified version - full brute force would test millions)")
    print("   Consider using --file with a known list for better results")
    
    # Test a sample (not all, as it would take too long)
    test_sample = patterns_to_test[:1000]  # Test first 1000
    
    for i, test_name in enumerate(test_sample, 1):
        if i % 100 == 0:
            print(f"   Testing... {i}/{len(test_sample)}")
        
        # Quick test: try to download (with short timeout)
        try:
            url = f"{BASE_URL}?airfoil={quote(test_name)}"
            req = Request(url)
            req.add_header('User-Agent', 'Mozilla/5.0 (Python Airfoil Downloader)')
            
            with urlopen(req, timeout=3) as response:
                content = response.read()
                # If not HTML error page, it's a valid airfoil
                if not (content.startswith(b'<!DOCTYPE') or content.startswith(b'<html')):
                    discovered.add(test_name)
        except:
            pass  # Not a valid airfoil, continue
        
        time.sleep(0.1)  # Small delay
    
    return sorted(list(discovered))


def main():
    parser = argparse.ArgumentParser(
        description="Download airfoil coordinate files in Selig format from airfoiltools.com",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Download a single airfoil
  python download_airfoil_coordinates.py ag16-il
  
  # Download multiple airfoils
  python download_airfoil_coordinates.py ag16-il e325-il naca0012-il
  
  # Download from a file
  python download_airfoil_coordinates.py --file airfoil_list.txt
  
  # Download ALL available airfoils
  python download_airfoil_coordinates.py --all
  
  # Discover all airfoils and save list (without downloading)
  python download_airfoil_coordinates.py --discover-only --save-list airfoils.txt
  
  # Specify output directory
  python download_airfoil_coordinates.py ag16-il --output ./my_airfoils
        """
    )
    
    parser.add_argument(
        'airfoils',
        nargs='*',
        help='Airfoil names to download (e.g., ag16-il, e325-il)'
    )
    
    parser.add_argument(
        '--file', '-f',
        type=str,
        help='Text file containing airfoil names (one per line)'
    )
    
    parser.add_argument(
        '--output', '-o',
        type=str,
        default=DEFAULT_OUTPUT_DIR,
        help=f'Output directory for downloaded files (default: {DEFAULT_OUTPUT_DIR})'
    )
    
    parser.add_argument(
        '--delay',
        type=float,
        default=REQUEST_DELAY,
        help=f'Delay between requests in seconds (default: {REQUEST_DELAY})'
    )
    
    parser.add_argument(
        '--all',
        action='store_true',
        help='Download ALL available airfoils (discovers and downloads all)'
    )
    
    parser.add_argument(
        '--discover-only',
        action='store_true',
        help='Only discover airfoils and save list to file, do not download'
    )
    
    parser.add_argument(
        '--save-list',
        type=str,
        help='Save discovered airfoil list to this file (used with --all)'
    )
    
    args = parser.parse_args()
    
    # Collect airfoil names
    airfoil_names: List[str] = []
    
    # If --all flag is set, discover all airfoils
    if args.all or args.discover_only:
        print("\n" + "=" * 60)
        print("⚠️  IMPORTANT: Discovering ALL airfoils")
        print("=" * 60)
        print("This will attempt to discover all available airfoils.")
        print("Note: The discovery process may not find 100% of airfoils.")
        print("For a complete list, consider:")
        print("  1. Using a known comprehensive airfoil database")
        print("  2. Manually compiling a list from airfoiltools.com")
        print("  3. Using the UIUC Airfoil Database")
        print("=" * 60 + "\n")
        
        save_path = Path(args.save_list) if args.save_list else Path("all_airfoils_list.txt")
        discovered = discover_all_airfoils(save_to_file=save_path)
        airfoil_names.extend(discovered)
        print(f"\n✓ Discovered {len(discovered)} airfoils")
        
        if args.discover_only:
            print(f"💾 Airfoil list saved to: {save_path.absolute()}")
            print("   Run the script again with --file to download them.")
            sys.exit(0)
        
        # Ask for confirmation if downloading many airfoils
        if len(discovered) > 100:
            print(f"\n⚠️  About to download {len(discovered)} airfoils.")
            print("   This will take a significant amount of time.")
            try:
                response = input("   Continue? (yes/no): ").strip().lower()
                if response not in ['yes', 'y']:
                    print("   Cancelled.")
                    sys.exit(0)
            except (KeyboardInterrupt, EOFError):
                print("\n   Cancelled.")
                sys.exit(0)
    
    if args.file:
        airfoil_names.extend(read_airfoil_list(Path(args.file)))
    
    if args.airfoils:
        airfoil_names.extend(args.airfoils)
    
    if not airfoil_names:
        parser.print_help()
        print("\n❌ Error: No airfoils specified. Provide airfoil names, use --file option, or use --all to download all.")
        sys.exit(1)
    
    # Remove duplicates while preserving order
    seen = set()
    unique_airfoils = []
    for name in airfoil_names:
        if name not in seen:
            seen.add(name)
            unique_airfoils.append(name)
    
    if len(unique_airfoils) < len(airfoil_names):
        print(f"ℹ️  Removed {len(airfoil_names) - len(unique_airfoils)} duplicate airfoil names")
    
    # Setup output directory
    output_dir = Path(args.output)
    
    # Print summary
    print("=" * 60)
    print(f"Airfoil Coordinate Downloader")
    print("=" * 60)
    print(f"Airfoils to download: {len(unique_airfoils)}")
    print(f"Output directory: {output_dir.absolute()}")
    print(f"Request delay: {args.delay}s")
    print("=" * 60)
    print()
    
    # Download airfoils
    success_count = 0
    fail_count = 0
    start_time = time.time()
    
    for i, airfoil_name in enumerate(unique_airfoils, 1):
        print(f"[{i}/{len(unique_airfoils)}] ", end='')
        if download_airfoil(airfoil_name, output_dir):
            success_count += 1
        else:
            fail_count += 1
        
        # Delay between requests (except for the last one)
        if i < len(unique_airfoils):
            time.sleep(args.delay)
    
    # Print summary
    elapsed_time = time.time() - start_time
    print()
    print("=" * 60)
    print("Download Summary")
    print("=" * 60)
    print(f"✓ Successful: {success_count}")
    print(f"❌ Failed: {fail_count}")
    print(f"⏱️  Total time: {elapsed_time:.1f}s")
    print(f"📁 Files saved to: {output_dir.absolute()}")
    print("=" * 60)


if __name__ == "__main__":
    main()
