# Maintainer: Terromur <terromuroz@proton.me>
# Maintainer: Fazri Gading <fazrigading@gmail.com>
# This PKGBUILD is for Github Releases
pkgname=Hytale-F2P
pkgver=2.2.1
pkgrel=1
pkgdesc="Hytale-F2P - unofficial Hytale Launcher for free to play with multiplayer support"
arch=('x86_64')
url="https://github.com/amiayweb/Hytale-F2P"
license=('custom')
depends=('gtk3' 'nss' 'libxcrypt-compat')
makedepends=('npm')
provides=('Hytale-F2P-git' 'hytale-f2p-git')
conflicts=('Hytale-F2P-git' 'hytale-f2p-git')
source=("$url/archive/v$pkgver.tar.gz" "Hytale-F2P.desktop")
sha256sums=('SKIP' '46488fada4775d9976d7b7b62f8d1f1f8d9a9a9d8f8aa9af4f2e2153019f6a30')

build() {
   cd "$pkgname-$pkgver"
   npm ci
   npm run build:arch
}

package() {
  cd "$pkgname-$pkgver"
  install -d "$pkgdir/opt/$pkgname"
  cp -r dist/linux-unpacked/* "$pkgdir/opt/$pkgname"
  install -Dm644 "$srcdir/$pkgname.desktop" "$pkgdir/usr/share/applications/$pkgname.desktop"
  install -Dm644 GUI/icon.png "$pkgdir/usr/share/icons/hicolor/256x256/apps/$pkgname.png"
}
