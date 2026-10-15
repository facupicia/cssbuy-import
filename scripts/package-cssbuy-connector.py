from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
source = root / "extensions" / "cssbuy-connector"
target = root / "public" / "plug-cssbuy-connector.zip"
target.parent.mkdir(exist_ok=True)
with ZipFile(target, "w", ZIP_DEFLATED) as archive:
    for name in ("manifest.json", "background.js", "collector.js", "bridge.js"):
        archive.write(source / name, "plug-cssbuy-connector/" + name)
print("Conector empaquetado")
