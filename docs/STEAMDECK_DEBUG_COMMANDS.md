# Steam Deck / Linux Crash Fix

## SOLUTION: Use system libzstd

The crash is caused by the bundled `libzstd.so` being incompatible with glibc 2.41's stricter heap validation.

### Automatic Fix

The launcher automatically replaces `libzstd.so` with the system version. No manual action needed.

### Manual Fix

```bash
cd ~/.hytalef2p/release/package/game/latest/Client

# Backup and replace
mv libzstd.so libzstd.so.bundled
ln -s /usr/lib/libzstd.so.1 libzstd.so
```

### Restore Original

```bash
cd ~/.hytalef2p/release/package/game/latest/Client
rm libzstd.so
mv libzstd.so.bundled libzstd.so
```

---

## Debug Commands (for troubleshooting)

### Check libzstd Status

```bash
# Check if symlinked
ls -la ~/.hytalef2p/release/package/game/latest/Client/libzstd.so

# Find system libzstd
find /usr/lib -name "libzstd.so*"
```

### Binary Validation

```bash
file ~/.hytalef2p/release/package/game/latest/Client/HytaleClient
ldd ~/.hytalef2p/release/package/game/latest/Client/HytaleClient
```

### Restore Client Binary

```bash
cd ~/.hytalef2p/release/package/game/latest/Client
cp HytaleClient.original HytaleClient
rm -f HytaleClient.patched_custom
```

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `HYTALE_AUTH_DOMAIN` | Custom auth domain | `auth.sanasol.ws` |
| `HYTALE_NO_LIBZSTD_FIX` | Disable libzstd replacement | `1` |
