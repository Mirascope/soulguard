# Imperative watch: add a new file to watch tier
echo '{"version":1,"files":{"soulguard.json":"protect"}}' > soulguard.json
mkdir -p memory
echo '# Notes' > memory/notes.md

SUDO_USER=agent soulguard init .

# Watch the file
soulguard watch memory/notes.md -w .

echo "CONFIG:"
cat soulguard.json

# Verify status is clean
echo "STATUS:"
NO_COLOR=1 soulguard status . 2>&1
