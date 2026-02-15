# Airfoil Coordinate Downloader

Python script to download airfoil coordinate data files in Selig format (.dat files) from airfoiltools.com.

## Requirements

No external dependencies required! Uses only Python standard library:
- `urllib.request` - for downloading files
- `pathlib` - for file path handling
- `argparse` - for command-line arguments

Python 3.6+ required.

## Usage

### Download a single airfoil

```bash
python scripts/download_airfoil_coordinates.py ag16-il
```

### Download multiple airfoils

```bash
python scripts/download_airfoil_coordinates.py ag16-il e325-il naca0012-il
```

### Download from a text file

Create a text file with one airfoil name per line:

```bash
python scripts/download_airfoil_coordinates.py --file scripts/airfoil_list_example.txt
```

### Specify output directory

```bash
python scripts/download_airfoil_coordinates.py ag16-il --output ./my_airfoils
```

### Download ALL airfoils

Discover and download all available airfoils:

```bash
python scripts/download_airfoil_coordinates.py --all
```

**Note:** The discovery process attempts to find all airfoils but may not be 100% complete. For a comprehensive list, consider using a known airfoil database or manually compiling a list.

### Discover only (save list without downloading)

Discover all airfoils and save the list to a file without downloading:

```bash
python scripts/download_airfoil_coordinates.py --discover-only --save-list all_airfoils.txt
```

Then download later:

```bash
python scripts/download_airfoil_coordinates.py --file all_airfoils.txt
```

### Adjust request delay

To be more respectful to the server (or faster if needed):

```bash
python scripts/download_airfoil_coordinates.py ag16-il --delay 1.0
```

## Features

- ✅ Downloads airfoil coordinate files in Selig format (.dat)
- ✅ Handles errors gracefully with retry logic
- ✅ Skips already downloaded files
- ✅ Supports batch downloads from file or command line
- ✅ Progress tracking and summary statistics
- ✅ Respectful rate limiting between requests
- ✅ Sanitizes filenames for cross-platform compatibility

## Output

Files are saved as `{airfoil_name}.dat` in the specified output directory (default: `airfoil_coordinates/`).

## Examples

```bash
# Download a few common airfoils
python scripts/download_airfoil_coordinates.py ag16-il e325-il naca0012-il

# Download from a list file
python scripts/download_airfoil_coordinates.py --file airfoil_list.txt --output ./coordinates

# Download ALL available airfoils
python scripts/download_airfoil_coordinates.py --all --output ./all_airfoils

# Discover all airfoils and save list (without downloading)
python scripts/download_airfoil_coordinates.py --discover-only --save-list complete_list.txt

# Download with longer delay between requests
python scripts/download_airfoil_coordinates.py ag16-il --delay 2.0
```

## Notes

- The script automatically retries failed downloads (3 attempts by default)
- Files that already exist are skipped automatically
- The script includes a small delay between requests to be respectful to the server
- Airfoil names should match the format used on airfoiltools.com (e.g., `ag16-il`, `e325-il`)
