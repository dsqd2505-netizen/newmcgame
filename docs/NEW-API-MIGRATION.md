# Migration vers la nouvelle API ShipOfYarn

## Vue d'ensemble

Le launcher Hytale-F2P utilise maintenant une nouvelle API hébergée sur `thecute.cloud` pour télécharger les fichiers `.pwr` du jeu. Cette migration permet une meilleure gestion des fichiers et une distribution plus fiable.

## Changements principaux

### 1. Nouvelle URL de l'API

**Ancienne API:**
- Base URL: `https://game-patches.hytale.com/patches`
- Format: `https://game-patches.hytale.com/patches/{os}/{arch}/{branch}/0/{version}.pwr`

**Nouvelle API:**
- URL: `https://thecute.cloud/ShipOfYarn/api.php`
- Format: JSON structuré avec URLs complètes pour chaque fichier

### 2. Nouveau format de version

**Ancien format:**
- `7.pwr`, `6.pwr`, `5.pwr`, etc.
- Version extraite avec: `parseInt(version.replace('.pwr', ''))`

**Nouveau format:**
- `v8`, `v7`, `v6`, etc.
- Version extraite avec: `extractVersionNumber(version)` (supporte les deux formats)

### 3. Structure de l'API

```json
{
  "hytale": {
    "release": {
      "windows": {
        "v8-windows-amd64.pwr": "https://thecute.cloud/ShipOfYarn/file.php?DBU21RDU1Y",
        "v7-windows-amd64.pwr": "https://thecute.cloud/ShipOfYarn/file.php?BL21DULUYB",
        ...
      },
      "linux": {
        "v8-linux-amd64.pwr": "https://thecute.cloud/ShipOfYarn/file.php?DX3BRUB3D1",
        ...
      },
      "mac": {
        "v8-darwin-arm64.pwr": "https://thecute.cloud/ShipOfYarn/file.php?XDAUBU1Y2R",
        ...
      }
    },
    "pre-release": {
      "windows": { ... },
      "linux": { ... },
      "mac": { ... }
    }
  },
  "jre": { ... },
  "butler": { ... }
}
```

## Modifications du code

### Fichiers modifiés

1. **`backend/services/versionManager.js`**
   - ✅ Ajout de `fetchNewAPI()` - Récupère et met en cache les données de l'API
   - ✅ Ajout de `getLatestVersionFromNewAPI()` - Détecte la version la plus récente
   - ✅ Ajout de `getPWRUrlFromNewAPI()` - Obtient l'URL de téléchargement
   - ✅ Ajout de `extractVersionNumber()` - Parse les versions (ancien et nouveau format)
   - ✅ Modification de `getLatestClientVersion()` - Utilise la nouvelle API avec fallback
   - ✅ Mise à jour de toutes les fonctions utilisant `parseInt(version.replace('.pwr', ''))`

2. **`backend/managers/gameManager.js`**
   - ✅ Modification de `downloadPWR()` - Utilise `getPWRUrlFromNewAPI()` avec fallback

3. **`backend/core/testConfig.js`**
   - ✅ Changement de `CLEAN_INSTALL_TEST_VERSION` de `'4.pwr'` à `'v4'`

4. **`main.js`**
   - ✅ Mise à jour des fallbacks de `'7.pwr'` vers `'v8'`

### Nouvelles fonctions

#### `fetchNewAPI()`
Récupère les données de l'API avec système de cache (1 minute).

```javascript
const apiData = await fetchNewAPI();
// Retourne l'objet JSON complet de l'API
```

#### `getLatestVersionFromNewAPI(branch)`
Détecte automatiquement la version la plus élevée disponible.

```javascript
const latestVersion = await getLatestVersionFromNewAPI('release');
// Retourne: "v8"
```

#### `getPWRUrlFromNewAPI(branch, version)`
Obtient l'URL de téléchargement pour une version spécifique.

```javascript
const url = await getPWRUrlFromNewAPI('release', 'v8');
// Retourne: "https://thecute.cloud/ShipOfYarn/file.php?DBU21RDU1Y"
```

#### `extractVersionNumber(version)`
Parse le numéro de version depuis n'importe quel format.

```javascript
extractVersionNumber('v8')      // → 8
extractVersionNumber('7.pwr')   // → 7
extractVersionNumber('v8-windows-amd64.pwr')  // → 8
```

## Fonctionnement

### 1. Détection de la dernière version

```javascript
// Nouvelle API appelée en premier
const latestVersion = await getLatestClientVersion('release');
// Retourne: "v8"

// L'API est cachée pendant 1 minute pour éviter les requêtes multiples
```

### 2. Téléchargement d'un fichier PWR

```javascript
// 1. Obtenir l'URL depuis la nouvelle API
const url = await getPWRUrlFromNewAPI('release', 'v8');

// 2. Télécharger le fichier
await downloadFile(url, destinationPath, progressCallback);
```

### 3. Vérification de mise à jour

```javascript
const installedVersion = getInstalledClientVersion();  // "v7"
const latestVersion = await getLatestClientVersion();   // "v8"

if (installedVersion !== latestVersion) {
  // Mise à jour nécessaire
  await updateGameFiles(latestVersion, progressCallback);
}
```

## Fallback et compatibilité

### Système de fallback

Si la nouvelle API échoue, le système bascule automatiquement vers l'ancienne méthode:

```javascript
try {
  url = await getPWRUrlFromNewAPI(branch, fileName);
  console.log('[DownloadPWR] Using new API URL');
} catch (error) {
  console.log('[DownloadPWR] Falling back to old URL format');
  url = `https://game-patches.hytale.com/patches/${osName}/${arch}/${branch}/0/${fileName}.pwr`;
}
```

### Compatibilité ascendante

La fonction `extractVersionNumber()` supporte les deux formats:

```javascript
// Ancien format
extractVersionNumber('7.pwr')     // → 7
extractVersionNumber('6.pwr')     // → 6

// Nouveau format
extractVersionNumber('v8')        // → 8
extractVersionNumber('v7')        // → 7

// Format mixte
extractVersionNumber('v8-windows-amd64.pwr')  // → 8
```

## Cache de l'API

L'API est cachée pendant **1 minute** pour optimiser les performances:

```javascript
const API_CACHE_DURATION = 60000; // 1 minute

// Premier appel: requête HTTP
const data1 = await fetchNewAPI();  // Requête vers thecute.cloud

// Appels suivants (< 1 min): cache
const data2 = await fetchNewAPI();  // Retourne le cache
const data3 = await fetchNewAPI();  // Retourne le cache

// Après 1 minute: nouvelle requête
```

## Mapping OS

L'API utilise des noms d'OS différents:

| OS interne | API ShipOfYarn |
|-----------|----------------|
| `windows` | `windows`      |
| `linux`   | `linux`        |
| `darwin`  | `mac`          |

## Détails techniques

### Détection de la version la plus récente

```javascript
// Récupère toutes les versions disponibles
const versions = Object.keys(osData).filter(key => key.endsWith('.pwr'));
// ["v8-windows-amd64.pwr", "v7-windows-amd64.pwr", ...]

// Extrait les numéros
const versionNumbers = versions.map(v => {
  const match = v.match(/v(\d+)/);
  return match ? parseInt(match[1]) : 0;
});
// [8, 7, 6, 5, ...]

// Trouve le maximum
const latest = Math.max(...versionNumbers);
// 8
```

### Construction du nom de fichier

```javascript
if (osName === 'windows') {
  fileName = `${version}-windows-amd64.pwr`;  // "v8-windows-amd64.pwr"
} else if (osName === 'linux') {
  fileName = `${version}-linux-amd64.pwr`;    // "v8-linux-amd64.pwr"
} else if (osName === 'darwin') {
  fileName = `${version}-darwin-arm64.pwr`;   // "v8-darwin-arm64.pwr"
}
```

## Branches supportées

- `release` - Version stable
- `pre-release` - Version de test (v19~20, v18~19, etc.)

**Note:** Les patches différentiels (`HytaleClient-v3-patch.xdelta`) sont ignorés avec cette nouvelle API.

## Migration des versions existantes

Les anciennes installations avec versions au format `7.pwr` continueront de fonctionner:

1. Version installée détectée: `7.pwr`
2. Dernière version disponible: `v8`
3. Comparaison: `"7.pwr" !== "v8"` → Mise à jour nécessaire
4. Téléchargement de `v8` depuis la nouvelle API
5. Installation et sauvegarde de la version: `v8`

## Logs et debugging

Les logs indiquent maintenant l'utilisation de l'API:

```
[NewAPI] Fetching from: https://thecute.cloud/ShipOfYarn/api.php
[NewAPI] API data fetched and cached successfully
[NewAPI] Latest version number: 8 for branch release
[NewAPI] Latest client version for release: v8
[DownloadPWR] Fetching URL from new API for branch: release, version: v8
[NewAPI] URL for v8-windows-amd64.pwr: https://thecute.cloud/ShipOfYarn/file.php?...
[DownloadPWR] Using new API URL: https://thecute.cloud/...
```

## Erreurs potentielles

### API indisponible
```
[NewAPI] Error fetching API: ENOTFOUND thecute.cloud
[NewAPI] Falling back to old API...
```
→ Le système bascule automatiquement vers l'ancienne API

### Version introuvable
```
[NewAPI] No URL found for v9-windows-amd64.pwr
```
→ La version demandée n'existe pas dans l'API

### Timeout
```
[NewAPI] Using expired cache due to error
```
→ Le cache expiré est utilisé en cas d'erreur réseau

## Tests recommandés

1. **Installation propre** - Vérifier que v8 est téléchargé
2. **Mise à jour depuis v7** - Vérifier la détection et l'update
3. **Branches** - Tester `release` et `pre-release`
4. **Fallback** - Bloquer thecute.cloud et vérifier le fallback
5. **Cache** - Vérifier que l'API n'est pas appelée trop souvent

## Avantages de la nouvelle API

✅ **URLs directes** - Plus besoin de construire les chemins  
✅ **Meilleure distribution** - Fichiers hébergés sur CDN optimisé  
✅ **Versions flexibles** - Support de formats multiples  
✅ **Cache intelligent** - Réduit la charge sur l'API  
✅ **Fallback automatique** - Continue de fonctionner si l'API est down  
✅ **Logs détaillés** - Meilleure traçabilité  

## Conclusion

La migration vers la nouvelle API ShipOfYarn améliore la fiabilité et la performance du système de téléchargement tout en maintenant une compatibilité complète avec les anciennes versions grâce au système de fallback et à la fonction `extractVersionNumber()`.
