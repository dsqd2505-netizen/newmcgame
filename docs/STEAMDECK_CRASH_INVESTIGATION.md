# Steam Deck / Ubuntu LTS Crash Investigation

## Status: SOLVED

**Last updated:** 2026-01-27

**Solution:** Replace bundled `libzstd.so` with system version.

---

## Problem Summary

The Hytale F2P launcher's client patcher causes crashes on Steam Deck and Ubuntu LTS with the error:
```
free(): invalid pointer
```
or
```
SIGSEGV (Segmentation fault)
```

The crash occurs after successful authentication, specifically right after "Finished handling RequiredAssets".

**Affected Systems:**
- Steam Deck (glibc 2.41)
- Ubuntu LTS

**Working Systems:**
- macOS
- Windows
- Older Arch Linux (glibc < 2.41)

---

## Root Cause

The **bundled `libzstd.so`** in the game client is incompatible with glibc 2.41's stricter heap validation. When the game decompresses assets using this library, it triggers heap corruption detected by glibc 2.41.

The crash occurs in `libzstd.so` during `free()` after "Finished handling RequiredAssets" (asset decompression).

---

## Solution

Replace the bundled `libzstd.so` with the system's `libzstd.so.1`.

### Automatic (Launcher)

The launcher automatically detects and replaces `libzstd.so` on Linux systems. No manual action needed.

### Manual

```bash
cd ~/.hytalef2p/release/package/game/latest/Client

# Backup bundled version
mv libzstd.so libzstd.so.bundled

# Link to system version
# Steam Deck / Arch Linux:
ln -s /usr/lib/libzstd.so.1 libzstd.so

# Debian / Ubuntu:
ln -s /usr/lib/x86_64-linux-gnu/libzstd.so.1 libzstd.so

# Fedora / RHEL:
ln -s /usr/lib64/libzstd.so.1 libzstd.so
```

### Restore Original

```bash
cd ~/.hytalef2p/release/package/game/latest/Client
rm libzstd.so
mv libzstd.so.bundled libzstd.so
```

---

## Why This Works

1. The bundled `libzstd.so` was likely compiled with different allocator settings or an older toolchain
2. glibc 2.41 has stricter heap validation that catches invalid memory operations
3. The system `libzstd.so.1` is compiled with the system's glibc and uses compatible memory allocation patterns
4. By using the system library, we avoid the incompatibility entirely

---

## Previous Investigation (for reference)

### What Was Tried Before Finding Solution

| Approach | Result |
|----------|--------|
| jemalloc allocator | Worked ~30% of time, not stable |
| GLIBC_TUNABLES | No effect |
| taskset (CPU pinning) | Single core too slow |
| nice/chrt (scheduling) | No effect |
| Various patching approaches | All crashed |

### Key Insight

The crash was in `libzstd.so`, not in our patched code. The patching just changed timing enough to expose the libzstd incompatibility more frequently.

---

## GDB Stack Trace (Historical)

```
#0  0x00007ffff7d3f5a4 in ?? () from /usr/lib/libc.so.6
#1  raise () from /usr/lib/libc.so.6
#2  abort () from /usr/lib/libc.so.6
#3-#4  ?? () from /usr/lib/libc.so.6
#5  free () from /usr/lib/libc.so.6
#6  ?? () from libzstd.so    <-- CRASH POINT (bundled library)
#7-#24  HytaleClient code (asset decompression)
```

---

## Branch

`fix/steamdeck-libzstd`
