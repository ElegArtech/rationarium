# Traitement des 54 avis élevés ou critiques PostgreSQL

Les 118 occurrences initiales sont regroupées par avis. Le scan est complété par l’absence matérielle des composants retirés et par les versions corrigées des bibliothèques conservées. Le premier prototype Alpine, pourtant scanné à zéro, est explicitement refusé car il embarquait encore libxml2 2.13. Identifiants et versions : [preuve structurée](references/remediation-postgresql.json). Sources des correctifs : [ADR](adr/ADR-20261003-postgresql-alpine.md).

| Avis | Gravité | Paquets initiaux | Traitement |
| --- | --- | --- | --- |
| [CVE-2023-2953](https://avd.aquasec.com/nvd/cve-2023-2953) | HIGH | libldap-2.5-0 | OpenLDAP 2.6.15-r0, postérieur aux correctifs amont |
| [CVE-2023-45853](https://avd.aquasec.com/nvd/cve-2023-45853) | CRITICAL | zlib1g | zlib 1.3.2-r0 ; MiniZip absent |
| [CVE-2025-61726](https://avd.aquasec.com/nvd/cve-2025-61726) | HIGH | stdlib | Binaire gosu supprimé ; su-exec 0.3-r0 |
| [CVE-2025-61729](https://avd.aquasec.com/nvd/cve-2025-61729) | HIGH | stdlib | Binaire gosu supprimé ; su-exec 0.3-r0 |
| [CVE-2025-68121](https://avd.aquasec.com/nvd/cve-2025-68121) | CRITICAL | stdlib | Binaire gosu supprimé ; su-exec 0.3-r0 |
| [CVE-2025-69720](https://avd.aquasec.com/nvd/cve-2025-69720) | HIGH | libncursesw6, libtinfo6, ncurses-base, ncurses-bin | ncurses 6.6_p20260516-r0, après le correctif du 13 décembre 2025 |
| [CVE-2025-7458](https://avd.aquasec.com/nvd/cve-2025-7458) | CRITICAL | libsqlite3-0 | SQLite absent de l’image finale |
| [CVE-2026-103111](https://avd.aquasec.com/nvd/cve-2026-103111) | HIGH | libpcre2-8-0 | PCRE2 absent de l’image finale |
| [CVE-2026-11822](https://avd.aquasec.com/nvd/cve-2026-11822) | HIGH | libsqlite3-0 | SQLite absent de l’image finale |
| [CVE-2026-11824](https://avd.aquasec.com/nvd/cve-2026-11824) | HIGH | libsqlite3-0 | SQLite absent de l’image finale |
| [CVE-2026-13221](https://avd.aquasec.com/nvd/cve-2026-13221) | CRITICAL | libperl5.36, perl-base, perl-modules-5.36, perl | Perl et bibliothèques Perl absents de l’image finale |
| [CVE-2026-16742](https://avd.aquasec.com/nvd/cve-2026-16742) | HIGH | libsystemd0, libudev1 | systemd et udev absents de l’image finale |
| [CVE-2026-25679](https://avd.aquasec.com/nvd/cve-2026-25679) | HIGH | stdlib | Binaire gosu supprimé ; su-exec 0.3-r0 |
| [CVE-2026-27145](https://avd.aquasec.com/nvd/cve-2026-27145) | HIGH | stdlib | Binaire gosu supprimé ; su-exec 0.3-r0 |
| [CVE-2026-32280](https://avd.aquasec.com/nvd/cve-2026-32280) | HIGH | stdlib | Binaire gosu supprimé ; su-exec 0.3-r0 |
| [CVE-2026-32281](https://avd.aquasec.com/nvd/cve-2026-32281) | HIGH | stdlib | Binaire gosu supprimé ; su-exec 0.3-r0 |
| [CVE-2026-32283](https://avd.aquasec.com/nvd/cve-2026-32283) | HIGH | stdlib | Binaire gosu supprimé ; su-exec 0.3-r0 |
| [CVE-2026-33811](https://avd.aquasec.com/nvd/cve-2026-33811) | HIGH | stdlib | Binaire gosu supprimé ; su-exec 0.3-r0 |
| [CVE-2026-33814](https://avd.aquasec.com/nvd/cve-2026-33814) | HIGH | stdlib | Binaire gosu supprimé ; su-exec 0.3-r0 |
| [CVE-2026-33818](https://avd.aquasec.com/nvd/cve-2026-33818) | HIGH | stdlib | Binaire gosu supprimé ; su-exec 0.3-r0 |
| [CVE-2026-39820](https://avd.aquasec.com/nvd/cve-2026-39820) | HIGH | stdlib | Binaire gosu supprimé ; su-exec 0.3-r0 |
| [CVE-2026-39821](https://avd.aquasec.com/nvd/cve-2026-39821) | HIGH | stdlib | Binaire gosu supprimé ; su-exec 0.3-r0 |
| [CVE-2026-39822](https://avd.aquasec.com/nvd/cve-2026-39822) | HIGH | stdlib | Binaire gosu supprimé ; su-exec 0.3-r0 |
| [CVE-2026-39836](https://avd.aquasec.com/nvd/cve-2026-39836) | HIGH | stdlib | Binaire gosu supprimé ; su-exec 0.3-r0 |
| [CVE-2026-41992](https://avd.aquasec.com/nvd/cve-2026-41992) | HIGH | gzip | GNU gzip absent ; outils BusyBox conservés |
| [CVE-2026-42496](https://avd.aquasec.com/nvd/cve-2026-42496) | CRITICAL | libperl5.36, perl-base, perl-modules-5.36, perl | Perl et bibliothèques Perl absents de l’image finale |
| [CVE-2026-42497](https://avd.aquasec.com/nvd/cve-2026-42497) | HIGH | libperl5.36, perl-base, perl-modules-5.36, perl | Perl et bibliothèques Perl absents de l’image finale |
| [CVE-2026-42499](https://avd.aquasec.com/nvd/cve-2026-42499) | HIGH | stdlib | Binaire gosu supprimé ; su-exec 0.3-r0 |
| [CVE-2026-42504](https://avd.aquasec.com/nvd/cve-2026-42504) | HIGH | stdlib | Binaire gosu supprimé ; su-exec 0.3-r0 |
| [CVE-2026-48962](https://avd.aquasec.com/nvd/cve-2026-48962) | HIGH | libperl5.36, perl-base, perl-modules-5.36, perl | Perl et bibliothèques Perl absents de l’image finale |
| [CVE-2026-53613](https://avd.aquasec.com/nvd/cve-2026-53613) | HIGH | bsdutils, libblkid1, libmount1, libsmartcols1, libuuid1, mount, util-linux-extra, util-linux | libuuid 2.42.3-r1 corrigée ; autres outils util-linux concernés absents |
| [CVE-2026-54369](https://avd.aquasec.com/nvd/cve-2026-54369) | HIGH | libacl1 | Bibliothèque ACL absente de l’image finale |
| [CVE-2026-56853](https://avd.aquasec.com/nvd/cve-2026-56853) | HIGH | stdlib | Binaire gosu supprimé ; su-exec 0.3-r0 |
| [CVE-2026-56858](https://avd.aquasec.com/nvd/cve-2026-56858) | HIGH | stdlib | Binaire gosu supprimé ; su-exec 0.3-r0 |
| [CVE-2026-56859](https://avd.aquasec.com/nvd/cve-2026-56859) | HIGH | stdlib | Binaire gosu supprimé ; su-exec 0.3-r0 |
| [CVE-2026-56860](https://avd.aquasec.com/nvd/cve-2026-56860) | HIGH | stdlib | Binaire gosu supprimé ; su-exec 0.3-r0 |
| [CVE-2026-56862](https://avd.aquasec.com/nvd/cve-2026-56862) | HIGH | stdlib | Binaire gosu supprimé ; su-exec 0.3-r0 |
| [CVE-2026-57432](https://avd.aquasec.com/nvd/cve-2026-57432) | HIGH | libperl5.36, perl-base, perl-modules-5.36, perl | Perl et bibliothèques Perl absents de l’image finale |
| [CVE-2026-57433](https://avd.aquasec.com/nvd/cve-2026-57433) | HIGH | libperl5.36, perl-base, perl-modules-5.36, perl | Perl et bibliothèques Perl absents de l’image finale |
| [CVE-2026-6653](https://avd.aquasec.com/nvd/cve-2026-6653) | CRITICAL | libxml2 | libxml2 supprimée ; PostgreSQL reconstruit sans XML/XSLT/LLVM |
| [CVE-2026-74860](https://avd.aquasec.com/nvd/cve-2026-74860) | HIGH | libxml2 | libxml2 supprimée ; PostgreSQL reconstruit sans XML/XSLT/LLVM |
| [CVE-2026-76642](https://avd.aquasec.com/nvd/cve-2026-76642) | HIGH | bsdutils, libblkid1, libmount1, libsmartcols1, libuuid1, mount, util-linux-extra, util-linux | libuuid 2.42.3-r1 corrigée ; autres outils util-linux concernés absents |
| [CVE-2026-78408](https://avd.aquasec.com/nvd/cve-2026-78408) | HIGH | bsdutils, libblkid1, libmount1, libsmartcols1, libuuid1, mount, util-linux-extra, util-linux | libuuid 2.42.3-r1 corrigée ; autres outils util-linux concernés absents |
| [CVE-2026-78409](https://avd.aquasec.com/nvd/cve-2026-78409) | HIGH | bsdutils, libblkid1, libmount1, libsmartcols1, libuuid1, mount, util-linux-extra, util-linux | libuuid 2.42.3-r1 corrigée ; autres outils util-linux concernés absents |
| [CVE-2026-78410](https://avd.aquasec.com/nvd/cve-2026-78410) | HIGH | bsdutils, libblkid1, libmount1, libsmartcols1, libuuid1, mount, util-linux-extra, util-linux | libuuid 2.42.3-r1 corrigée ; autres outils util-linux concernés absents |
| [CVE-2026-8376](https://avd.aquasec.com/nvd/cve-2026-8376) | CRITICAL | libperl5.36, perl-base, perl-modules-5.36, perl | Perl et bibliothèques Perl absents de l’image finale |
| [CVE-2026-84782](https://avd.aquasec.com/nvd/cve-2026-84782) | HIGH | libssl3, openssl | OpenSSL 3.5.9-r0, correctif amont du 29 septembre 2026 |
| [CVE-2026-86138](https://avd.aquasec.com/nvd/cve-2026-86138) | HIGH | libxml2 | libxml2 supprimée ; PostgreSQL reconstruit sans XML/XSLT/LLVM |
| [CVE-2026-86139](https://avd.aquasec.com/nvd/cve-2026-86139) | HIGH | libxml2 | libxml2 supprimée ; PostgreSQL reconstruit sans XML/XSLT/LLVM |
| [CVE-2026-86140](https://avd.aquasec.com/nvd/cve-2026-86140) | HIGH | libxml2 | libxml2 supprimée ; PostgreSQL reconstruit sans XML/XSLT/LLVM |
| [CVE-2026-86142](https://avd.aquasec.com/nvd/cve-2026-86142) | HIGH | libxml2 | libxml2 supprimée ; PostgreSQL reconstruit sans XML/XSLT/LLVM |
| [CVE-2026-86143](https://avd.aquasec.com/nvd/cve-2026-86143) | HIGH | libxml2 | libxml2 supprimée ; PostgreSQL reconstruit sans XML/XSLT/LLVM |
| [CVE-2026-86144](https://avd.aquasec.com/nvd/cve-2026-86144) | HIGH | libxml2 | libxml2 supprimée ; PostgreSQL reconstruit sans XML/XSLT/LLVM |
| [CVE-2026-9538](https://avd.aquasec.com/nvd/cve-2026-9538) | HIGH | libperl5.36, perl-base, perl-modules-5.36, perl | Perl et bibliothèques Perl absents de l’image finale |
