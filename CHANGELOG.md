# v2.13.3 (Tue Jan 10 2023)

#### 🐞 Fixes

- Extend validation errors for missing files in releases [#99](https://github.com/pleo-oss/file-distributor/pull/99) ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### Authors: 1

- Anders Fischer-Nielsen ([@andersfischernielsen](https://github.com/andersfischernielsen))

---

# v2.13.2 (Tue Jan 10 2023)

#### 🐞 Fixes

- Ensure label creation on PR creation [#100](https://github.com/pleo-oss/file-distributor/pull/100) ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### 🏠 Internal

- Change dependency bump to patch by default [#98](https://github.com/pleo-oss/file-distributor/pull/98) ([@marcos-arranz](https://github.com/marcos-arranz))
- Use check outcome for logging [#97](https://github.com/pleo-oss/file-distributor/pull/97) ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### Authors: 2

- Anders Fischer-Nielsen ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Marcos Arranz ([@marcos-arranz](https://github.com/marcos-arranz))

---

# v2.13.1 (Mon Jan 09 2023)

#### 🐞 Fixes

- Rename 'template' to 'file'/'release' globally [#95](https://github.com/pleo-oss/file-distributor/pull/95) ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### 🏠 Internal

- Restructure validation module to follow design of other modules [#93](https://github.com/pleo-oss/file-distributor/pull/93) ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Prefer passing data via Either instead of throwing custom exceptions [#92](https://github.com/pleo-oss/file-distributor/pull/92) ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Move GitHub calls to unified module [#90](https://github.com/pleo-oss/file-distributor/pull/90) ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Simplify checks module and types [#89](https://github.com/pleo-oss/file-distributor/pull/89) ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Reorder/simplify main application module [#88](https://github.com/pleo-oss/file-distributor/pull/88) ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Update Overview.md [#94](https://github.com/pleo-oss/file-distributor/pull/94) ([@r0binary](https://github.com/r0binary))

#### Authors: 2

- Anders Fischer-Nielsen ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Robin Lungwitz ([@r0binary](https://github.com/r0binary))

---

# v2.13.0 (Fri Dec 23 2022)

#### 🎁 Features

- Capture Unhandled errors and add rerun check listener [#80](https://github.com/pleo-oss/file-distributor/pull/80) ([@marcos-arranz](https://github.com/marcos-arranz))

#### Authors: 1

- Marcos Arranz ([@marcos-arranz](https://github.com/marcos-arranz))

---

# v2.12.4 (Tue Dec 20 2022)

#### 🐞 Fixes

- Fix invalid GitHub endpoint for PR review commenting [#87](https://github.com/pleo-oss/file-distributor/pull/87) ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### 🏠 Internal

- Update CODEOWNERS [#86](https://github.com/pleo-oss/file-distributor/pull/86) ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### Authors: 1

- Anders Fischer-Nielsen ([@andersfischernielsen](https://github.com/andersfischernielsen))

---

# v2.12.3 (Tue Dec 20 2022)

#### 🐞 Fixes

- Prefer commenting on PRs to submitting reviews [#85](https://github.com/pleo-oss/file-distributor/pull/85) ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### Authors: 1

- Anders Fischer-Nielsen ([@andersfischernielsen](https://github.com/andersfischernielsen))

---

# v2.12.2 (Thu Dec 15 2022)

#### 🐞 Fixes

- Broken yaml bug [#84](https://github.com/pleo-oss/file-distributor/pull/84) ([@marcos-arranz](https://github.com/marcos-arranz))

#### 🏠 Internal

- Add open-source tag for OpsLevel filtering [#79](https://github.com/pleo-oss/file-distributor/pull/79) ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### Authors: 2

- Anders Fischer-Nielsen ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Marcos Arranz ([@marcos-arranz](https://github.com/marcos-arranz))

---

# v2.12.1 (Tue Nov 29 2022)

#### 🐞 Fixes

- Change start script to inject custom octokit retry options [#78](https://github.com/pleo-oss/file-distributor/pull/78) ([@marcos-arranz](https://github.com/marcos-arranz))

#### Authors: 1

- Marcos Arranz ([@marcos-arranz](https://github.com/marcos-arranz))

---

# v2.12.0 (Tue Nov 22 2022)

#### 🎁 Features

- Move comments to checks [#77](https://github.com/pleo-oss/file-distributor/pull/77) ([@marcos-arranz](https://github.com/marcos-arranz))

#### Authors: 1

- Marcos Arranz ([@marcos-arranz](https://github.com/marcos-arranz))

---

# v2.11.1 (Thu Nov 17 2022)

#### 🐞 Fixes

- Simplify code and fix createTreeChanges [#76](https://github.com/pleo-oss/file-distributor/pull/76) ([@marcos-arranz](https://github.com/marcos-arranz))

#### Authors: 1

- Marcos Arranz ([@marcos-arranz](https://github.com/marcos-arranz))

---

# v2.11.0 (Thu Nov 17 2022)

#### 🎁 Features

- Add line comment on values errors [#73](https://github.com/pleo-oss/file-distributor/pull/73) ([@marcos-arranz](https://github.com/marcos-arranz))

#### 🏠 Internal

- Removes support for DataDog APM [#75](https://github.com/pleo-oss/file-distributor/pull/75) ([@dpotyralski](https://github.com/dpotyralski))

#### Authors: 2

- Damian Potyralski ([@dpotyralski](https://github.com/dpotyralski))
- Marcos Arranz ([@marcos-arranz](https://github.com/marcos-arranz))

---

# v2.10.2 (Tue Nov 15 2022)

#### 🐞 Fixes

- Push event ignored in case of branch removal action [#74](https://github.com/pleo-oss/file-distributor/pull/74) ([@dpotyralski](https://github.com/dpotyralski))

#### Authors: 1

- Damian Potyralski ([@dpotyralski](https://github.com/dpotyralski))

---

# v2.10.1 (Mon Nov 14 2022)

#### 🐞 Fixes

- Avoid creating PRs with no changes [#69](https://github.com/pleo-oss/file-distributor/pull/69) ([@andersfischernielsen](https://github.com/andersfischernielsen) [@marcos-arranz](https://github.com/marcos-arranz))

#### Authors: 2

- Anders Fischer-Nielsen ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Marcos Arranz ([@marcos-arranz](https://github.com/marcos-arranz))

---

# v2.10.0 (Thu Nov 10 2022)

#### 🎁 Features

- Add version as required in the schema [#72](https://github.com/pleo-oss/file-distributor/pull/72) ([@marcos-arranz](https://github.com/marcos-arranz))

#### Authors: 1

- Marcos Arranz ([@marcos-arranz](https://github.com/marcos-arranz))

---

# v2.9.0 (Thu Nov 10 2022)

#### 🎁 Features

- Send comment on PR errors per line [#71](https://github.com/pleo-oss/file-distributor/pull/71) ([@marcos-arranz](https://github.com/marcos-arranz))

#### Authors: 1

- Marcos Arranz ([@marcos-arranz](https://github.com/marcos-arranz))

---

# v2.8.0 (Mon Oct 31 2022)

#### 🎁 Features

- Support setting labels on created PRs [#70](https://github.com/pleo-oss/file-distributor/pull/70) ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### ⚠️ Pushed to `main`

- Remove redundant values ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### 🏠 Internal

- Support sending application traces/metrics to DataDog [#55](https://github.com/pleo-oss/file-distributor/pull/55) ([@dpotyralski](https://github.com/dpotyralski) [@andersfischernielsen](https://github.com/andersfischernielsen))
- Use SWC for better CI/test/build performance [#68](https://github.com/pleo-oss/file-distributor/pull/68) ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### Authors: 2

- Anders Fischer-Nielsen ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Damian Potyralski ([@dpotyralski](https://github.com/dpotyralski))

---

# v2.7.2 (Thu Oct 27 2022)

#### 🐞 Fixes

- Submit change requests for version validation issues [#62](https://github.com/pleo-oss/file-distributor/pull/62) ([@andersfischernielsen](https://github.com/andersfischernielsen) [@dpotyralski](https://github.com/dpotyralski))

#### 🏠 Internal

- Unify logging across implementation [#65](https://github.com/pleo-oss/file-distributor/pull/65) ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Add administration permissions for automerge [#63](https://github.com/pleo-oss/file-distributor/pull/63) ([@andersfischernielsen](https://github.com/andersfischernielsen) [@dpotyralski](https://github.com/dpotyralski))
- Add pull request events to readme local testing [#66](https://github.com/pleo-oss/file-distributor/pull/66) ([@marcos-arranz](https://github.com/marcos-arranz))

#### Authors: 3

- Anders Fischer-Nielsen ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Damian Potyralski ([@dpotyralski](https://github.com/dpotyralski))
- Marcos Arranz ([@marcos-arranz](https://github.com/marcos-arranz))

---

# v2.7.1 (Wed Oct 26 2022)

#### 🐞 Fixes

- Only approve PRs that exclusively change repository configuration [#64](https://github.com/pleo-oss/file-distributor/pull/64) ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### ⚠️ Pushed to `main`

- Prefer tsc for Docker building ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### 🏠 Internal

- Add README instructions for local testing [#56](https://github.com/pleo-oss/file-distributor/pull/56) ([@andersfischernielsen](https://github.com/andersfischernielsen) [@dpotyralski](https://github.com/dpotyralski))
- Prefer SWC only in tests and CI [#60](https://github.com/pleo-oss/file-distributor/pull/60) ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### Authors: 2

- Anders Fischer-Nielsen ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Damian Potyralski ([@dpotyralski](https://github.com/dpotyralski))

---

# v2.7.0 (Wed Oct 26 2022)

#### 🎁 Features

- Validate configured files are present in template releases [#58](https://github.com/pleo-oss/file-distributor/pull/58) ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### Authors: 1

- Anders Fischer-Nielsen ([@andersfischernielsen](https://github.com/andersfischernielsen))

---

# v2.6.0 (Wed Oct 26 2022)

#### 🎁 Features

- Support file definitions as strings [#57](https://github.com/pleo-oss/file-distributor/pull/57) ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### 🏠 Internal

- Use SWC for building [#59](https://github.com/pleo-oss/file-distributor/pull/59) ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Change logging to interpolate using pino [#46](https://github.com/pleo-oss/file-distributor/pull/46) ([@marcos-arranz](https://github.com/marcos-arranz))

#### Authors: 2

- Anders Fischer-Nielsen ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Marcos Arranz ([@marcos-arranz](https://github.com/marcos-arranz))

---

# v2.5.2 (Tue Oct 25 2022)

#### 🐞 Fixes

- Hotfix release fetch and noisy error logging [#54](https://github.com/pleo-oss/file-distributor/pull/54) ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### Authors: 1

- Anders Fischer-Nielsen ([@andersfischernielsen](https://github.com/andersfischernielsen))

---

# v2.5.1 (Tue Oct 25 2022)

#### 🐞 Fixes

- Reduce parameters of implementation by exporting built closures [#52](https://github.com/pleo-oss/file-distributor/pull/52) ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### 🏠 Internal

- Improve concurrency [#49](https://github.com/pleo-oss/file-distributor/pull/49) ([@marcos-arranz](https://github.com/marcos-arranz))
- Pin dependency genson-js to 0.0.8 [#48](https://github.com/pleo-oss/file-distributor/pull/48) ([@renovate[bot]](https://github.com/renovate[bot]))

#### Authors: 3

- [@renovate[bot]](https://github.com/renovate[bot])
- Anders Fischer-Nielsen ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Marcos Arranz ([@marcos-arranz](https://github.com/marcos-arranz))

---

# v2.5.0 (Mon Oct 24 2022)

#### 🎁 Features

- Fix tests and make probot throw error [#44](https://github.com/pleo-oss/file-distributor/pull/44) ([@marcos-arranz](https://github.com/marcos-arranz))

#### 🏠 Internal

- Fix App manifest permissions [#51](https://github.com/pleo-oss/file-distributor/pull/51) ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### Authors: 2

- Anders Fischer-Nielsen ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Marcos Arranz ([@marcos-arranz](https://github.com/marcos-arranz))

---

# v2.4.0 (Mon Oct 24 2022)

#### 🎁 Features

- Set the default template location to '.github/templates.yaml' [#50](https://github.com/pleo-oss/file-distributor/pull/50) ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### Authors: 1

- Anders Fischer-Nielsen ([@andersfischernielsen](https://github.com/andersfischernielsen))

---

# v2.3.0 (Mon Oct 24 2022)

#### 🎁 Features

- Validate value changes based on default template values [#45](https://github.com/pleo-oss/file-distributor/pull/45) ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Validate repository configuration changes on PR creation [#43](https://github.com/pleo-oss/file-distributor/pull/43) ([@marcos-arranz](https://github.com/marcos-arranz) [@andersfischernielsen](https://github.com/andersfischernielsen))

#### ⚠️ Pushed to `main`

- Update README.md ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### 🏠 Internal

- Automate linting across project [#47](https://github.com/pleo-oss/file-distributor/pull/47) ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Update Node.js to v19 [#42](https://github.com/pleo-oss/file-distributor/pull/42) ([@renovate[bot]](https://github.com/renovate[bot]))

#### Authors: 3

- [@renovate[bot]](https://github.com/renovate[bot])
- Anders Fischer-Nielsen ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Marcos Arranz ([@marcos-arranz](https://github.com/marcos-arranz))

---

# v2.3.0 (Fri Oct 21 2022)

#### 🎁 Features

- Validate repository configuration changes on PR creation [#43](https://github.com/pleo-oss/file-distributor/pull/43) ([@marcos-arranz](https://github.com/marcos-arranz) [@andersfischernielsen](https://github.com/andersfischernielsen))

#### 🏠 Internal

- Update Node.js to v19 [#42](https://github.com/pleo-oss/file-distributor/pull/42) ([@renovate[bot]](https://github.com/renovate[bot]))

#### Authors: 3

- [@renovate[bot]](https://github.com/renovate[bot])
- Anders Fischer-Nielsen ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Marcos Arranz ([@marcos-arranz](https://github.com/marcos-arranz))

---

# v2.2.0 (Wed Oct 19 2022)

#### 🎁 Features

- Extract and provide basic repository information for template values [#41](https://github.com/pleo-oss/file-distributor/pull/41) ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### Authors: 1

- Anders Fischer-Nielsen ([@andersfischernielsen](https://github.com/andersfischernielsen))

---

# v2.1.0 (Wed Oct 19 2022)

#### 🎁 Features

- Prepending headers support [#39](https://github.com/pleo-oss/file-distributor/pull/39) ([@dpotyralski](https://github.com/dpotyralski) [@andersfischernielsen](https://github.com/andersfischernielsen))

#### Authors: 2

- Anders Fischer-Nielsen ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Damian Potyralski ([@dpotyralski](https://github.com/dpotyralski))

---

# v2.0.0 (Tue Oct 18 2022)

#### 💥 Major changes

- Use GitHub Action-compatible delimiters for template rendering [#40](https://github.com/pleo-oss/file-distributor/pull/40) ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### ⚠️ Pushed to `main`

- Set Renovate labels to 'internal' by default ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### 🏠 Internal

- Pin dependency pino to 8.6.1 [#38](https://github.com/pleo-oss/file-distributor/pull/38) ([@renovate[bot]](https://github.com/renovate[bot]))
- Use Pino JSON logging [#37](https://github.com/pleo-oss/file-distributor/pull/37) ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Adds basic template rendering test [#35](https://github.com/pleo-oss/file-distributor/pull/35) ([@andersfischernielsen](https://github.com/andersfischernielsen) [@dpotyralski](https://github.com/dpotyralski))

#### Authors: 3

- [@renovate[bot]](https://github.com/renovate[bot])
- Anders Fischer-Nielsen ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Damian Potyralski ([@dpotyralski](https://github.com/dpotyralski))

---

# v1.0.5 (Thu Oct 13 2022)

#### 🐞 Fixes

- Update docker/metadata-action action to v4.1.0 [#36](https://github.com/pleo-oss/file-distributor/pull/36) ([@renovate[bot]](https://github.com/renovate[bot]) [@andersfischernielsen](https://github.com/andersfischernielsen))

#### ⚠️ Pushed to `main`

- Ensure concurrency policy is in place for release ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### 🏠 Internal

- Ensure Jest configuration for testing [#34](https://github.com/pleo-oss/file-distributor/pull/34) ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Reduce Octokit type across all function parameters [#31](https://github.com/pleo-oss/file-distributor/pull/31) ([@andersfischernielsen](https://github.com/andersfischernielsen) [@dpotyralski](https://github.com/dpotyralski))

#### Authors: 3

- [@renovate[bot]](https://github.com/renovate[bot])
- Anders Fischer-Nielsen ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Damian Potyralski ([@dpotyralski](https://github.com/dpotyralski))

---

# v1.0.4 (Thu Oct 13 2022)

#### 🐞 Fixes

- Update typescript-eslint monorepo to v5.40.0 [#29](https://github.com/pleo-oss/file-distributor/pull/29) ([@renovate[bot]](https://github.com/renovate[bot]))
- Update docker/login-action action to v2.1.0 [#33](https://github.com/pleo-oss/file-distributor/pull/33) ([@renovate[bot]](https://github.com/renovate[bot]))
- Update dependency @swc/core to v1.3.7 [#32](https://github.com/pleo-oss/file-distributor/pull/32) ([@renovate[bot]](https://github.com/renovate[bot]))

#### ⚠️ Pushed to `main`

- Create opslevel.yml ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Allow receiving pull_request webhook events ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### 🏠 Internal

- Refactor functions to use Octokit directly instead of passing Context parameters [#30](https://github.com/pleo-oss/file-distributor/pull/30) ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Include IntelliJ .idea run and test configurations [#27](https://github.com/pleo-oss/file-distributor/pull/27) ([@dpotyralski](https://github.com/dpotyralski) [@andersfischernielsen](https://github.com/andersfischernielsen))

#### Authors: 3

- [@renovate[bot]](https://github.com/renovate[bot])
- Anders Fischer-Nielsen ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Damian Potyralski ([@dpotyralski](https://github.com/dpotyralski))

---

# v1.0.3 (Tue Oct 11 2022)

#### 🐞 Fixes

- Update dependency @swc/core to v1.3.6 [#23](https://github.com/pleo-oss/file-distributor/pull/23) ([@renovate[bot]](https://github.com/renovate[bot]))
- Update dependency eslint to v8.25.0 [#24](https://github.com/pleo-oss/file-distributor/pull/24) ([@renovate[bot]](https://github.com/renovate[bot]))

#### 🏠 Internal

- Prefer console.log to Probot.log to avoid passing the app object around globally [#26](https://github.com/pleo-oss/file-distributor/pull/26) ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### Authors: 2

- [@renovate[bot]](https://github.com/renovate[bot])
- Anders Fischer-Nielsen ([@andersfischernielsen](https://github.com/andersfischernielsen))

---

# v1.0.2 (Tue Oct 11 2022)

#### 🐞 Fixes

- Ensure PR descriptions reflects changes made in PRs [#25](https://github.com/pleo-oss/file-distributor/pull/25) ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### ⚠️ Pushed to `main`

- Update CODEOWNERS ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Avoid running tests on the default branch ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### Authors: 1

- Anders Fischer-Nielsen ([@andersfischernielsen](https://github.com/andersfischernielsen))

---

# v1.0.1 (Mon Oct 10 2022)

#### 🐞 Fixes

- Update dependency axios to v1.1.2 [#22](https://github.com/pleo-oss/file-distributor/pull/22) ([@renovate[bot]](https://github.com/renovate[bot]))
- Update dependency @types/jest to v29.1.2 [#21](https://github.com/pleo-oss/file-distributor/pull/21) ([@renovate[bot]](https://github.com/renovate[bot]))
- Update dependency yaml to v2.1.3 [#19](https://github.com/pleo-oss/file-distributor/pull/19) ([@renovate[bot]](https://github.com/renovate[bot]))

#### ⚠️ Pushed to `main`

- Use multi-stage builds ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Skip building redundant Docker layers ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Slim down Docker image ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Remove fallback tag ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Add missing tag fetch in Docker checkout ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Use latest tag for Docker image tags ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Revert "Add Docker metadata verification in release" ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Add Docker metadata verification in release ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Attempt to get tags pushed ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### 🏠 Internal

- Add test workflow running on pushes [#20](https://github.com/pleo-oss/file-distributor/pull/20) ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### Authors: 2

- [@renovate[bot]](https://github.com/renovate[bot])
- Anders Fischer-Nielsen ([@andersfischernielsen](https://github.com/andersfischernielsen))

---

# v1.0.0 (Wed Oct 05 2022)

#### 💥 Major changes

- Change expected configuration file naming [#14](https://github.com/pleo-oss/file-distributor/pull/14) ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### 🐞 Fixes

- Update typescript-eslint monorepo to v5.39.0 [#13](https://github.com/pleo-oss/file-distributor/pull/13) ([@renovate[bot]](https://github.com/renovate[bot]))
- Update jest monorepo to v29 (major) [#17](https://github.com/pleo-oss/file-distributor/pull/17) ([@renovate[bot]](https://github.com/renovate[bot]))

#### ⚠️ Pushed to `main`

- Prefer Docker push Action to Auto ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Tag static Docker image in Auto release ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Update CODEOWNERS ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Resolve force pushing issues in PRs ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Bump all dependencies ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Remove invalid Renovate "matchCurrentVersion" ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Remove invalid comma ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Move and extend Renovate configuration ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Set up Prettier, VSCode, format ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Add missing IMAGE env variable ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Ensure proper Auto syntax ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Release to Docker Hub via Auto ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Remove redundant Docker image load ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Use current version for Docker Hub push ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Add conditional Auto release ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Add missing release tokens ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Elevate permissions for release ([@andersfischernielsen](https://github.com/andersfischernielsen))

#### 🏠 Internal

- Use Docker Hub write token [#18](https://github.com/pleo-oss/file-distributor/pull/18) ([@andersfischernielsen](https://github.com/andersfischernielsen))
- Update dependency typescript to v4.8.4 [#11](https://github.com/pleo-oss/file-distributor/pull/11) ([@renovate[bot]](https://github.com/renovate[bot]) [@andersfischernielsen](https://github.com/andersfischernielsen))
- Pin dependencies [#2](https://github.com/pleo-oss/file-distributor/pull/2) ([@renovate[bot]](https://github.com/renovate[bot]))
- Configure Renovate [#1](https://github.com/pleo-oss/file-distributor/pull/1) ([@renovate[bot]](https://github.com/renovate[bot]))

#### Authors: 2

- [@renovate[bot]](https://github.com/renovate[bot])
- Anders Fischer-Nielsen ([@andersfischernielsen](https://github.com/andersfischernielsen))
