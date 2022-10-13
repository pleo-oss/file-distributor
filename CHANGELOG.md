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
