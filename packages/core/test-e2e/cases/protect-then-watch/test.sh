echo "# My Soul" > SOUL.md

echo "# ls -lah SOUL.md:"
ls -lah SOUL.md | awk '{print $1, $3, $4, $NF}'
echo

echo "# soulguard init"
SUDO_USER=agent soulguard init . > /dev/null 2>&1
echo

echo "# soulguard protect SOUL.md"
SUDO_USER=agent soulguard protect SOUL.md
echo

echo "# ls -lah SOUL.md:"
ls -lah SOUL.md | awk '{print $1, $3, $4, $NF}'
echo

echo "# soulguard watch SOUL.md"
SUDO_USER=agent soulguard watch SOUL.md

echo "# ls -lah SOUL.md"
ls -lah SOUL.md | awk '{print $1, $3, $4, $NF}'
