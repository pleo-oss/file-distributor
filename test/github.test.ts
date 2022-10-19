import { createCheckRun, resolveCheckRun } from "../src/github";
import { mockDeep, DeepMockProxy } from "jest-mock-extended";
import { OctokitInstance } from "../src/types";

describe('Github api calls', () => {

    describe('Create check calls', () => {
        test('octokit is called with the proper object', async () => {
            const testInput = {
                owner: 'pleo',
                repo: 'workflows',
                sha: 'some-sha'
            }

            const octokitMock: DeepMockProxy<OctokitInstance> = mockDeep<OctokitInstance>()

            await createCheckRun(octokitMock, testInput)

            expect(octokitMock.checks.create).toBeCalledTimes(1)
            expect(octokitMock.checks.create)
                .toBeCalledWith(
                    {
                        headers: {
                            accept: "application/vnd.github.v3+json"
                        },
                        owner: testInput.owner,
                        repo: testInput.repo,
                        name: "Template Config schema validation",
                        head_sha: testInput.sha,
                        status: "queued",
                        output: {
                            title: "Queuing Template schema validation",
                            summary: "The validation will run shortly"
                        }
                    }
                )
        })


        test('when ocotkit is called with a different object check is not called', async () => {
            const testInput = {
                owner: 'pleo',
                repo: 'workflows',
                sha: 'some-sha'
            }

            const octokitMock: DeepMockProxy<OctokitInstance> = mockDeep<OctokitInstance>()

            await createCheckRun(octokitMock, testInput)

            expect(octokitMock.checks.create).toBeCalledTimes(1)
            expect(octokitMock.checks.create).not
                .toHaveBeenCalledWith(
                    {
                        headers: {
                            accept: "application/vnd.github.v3+json"
                        },
                        owner: "not-pleo",
                        repo: testInput.repo,
                        name: "Template Config schema validation",
                        head_sha: testInput.sha,
                        status: "queued",
                        output: {
                            title: "Queuing Template schema validation",
                            summary: "The validation will run shortly"
                        }
                    }
                )
        })

        test('when octokit throws exception check createCheck rethrows it', async () => {
            const testInput = {
                owner: 'pleo',
                repo: 'workflows',
                sha: 'some-sha'
            }

            const octokitMock: DeepMockProxy<OctokitInstance> = mockDeep<OctokitInstance>()

            octokitMock.checks.create.mockImplementation(async () => {
                throw new Error('Error')
            })

            expect.assertions(1)
            return createCheckRun(octokitMock, testInput).catch(
                e => expect(e.message).toMatch("Error")
            )
        })
    })

    describe('Update check calls', () => {
        test('octokit is called with the proper object', async () => {
            const testInput = {
                owner: 'pleo',
                repo: 'workflows',
                sha: 'some-sha',
                result: 'failure',
                check_run_id: 98
            }

            const octokitMock: DeepMockProxy<OctokitInstance> = mockDeep<OctokitInstance>()

            await resolveCheckRun(octokitMock, testInput)

            expect(octokitMock.checks.update).toBeCalledTimes(1)
            expect(octokitMock.checks.update)
                .toBeCalledWith(
                    {
                        headers: {
                            accept: "application/vnd.github.v3+json"
                        },
                        owner: testInput.owner,
                        repo: testInput.repo,
                        name: "Template Config schema validation",
                        check_run_id: testInput.check_run_id,
                        status: "completed",
                        head_sha: testInput.sha,
                        conclusion: testInput.result,
                        output: {
                            title: "Template config validated",
                            summary: "Result is " + testInput.result,
                        },
                    }
                )
        })

        test('octokit is not called with the proper object', async () => {
            const testInput = {
                owner: 'pleo',
                repo: 'workflows',
                sha: 'some-sha',
                result: 'failure',
                check_run_id: 98
            }

            const octokitMock: DeepMockProxy<OctokitInstance> = mockDeep<OctokitInstance>()

            await resolveCheckRun(octokitMock, testInput)

            expect(octokitMock.checks.update).toBeCalledTimes(1)
            expect(octokitMock.checks.update).not
                .toBeCalledWith(
                    {
                        headers: {
                            accept: "application/vnd.github.v3+json"
                        },
                        owner: 'not_pleo',
                        repo: testInput.repo,
                        name: "Template Config schema validation",
                        check_run_id: testInput.check_run_id,
                        status: "completed",
                        head_sha: testInput.sha,
                        conclusion: testInput.result,
                        output: {
                            title: "Template config validated",
                            summary: "Result is " + testInput.result,
                        },
                    }
                )
        })

        test('octokit throws error then it is rethrown', async () => {
            const testInput = {
                owner: 'pleo',
                repo: 'workflows',
                sha: 'some-sha',
                result: 'failure',
                check_run_id: 98
            }

            const octokitMock: DeepMockProxy<OctokitInstance> = mockDeep<OctokitInstance>()

            octokitMock.checks.update.mockImplementation(async () => {
                throw new Error('Error')
            })

            expect.assertions(1)
            return resolveCheckRun(octokitMock, testInput).catch(
                e => expect(e.message).toMatch("Error")
            )
        })
    })

})