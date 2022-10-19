import { OctokitInstance, CreateCheckInput, UpdateCheckInput } from "./types"

export const createCheckRun = async (octokit: OctokitInstance, createCheckDetails: CreateCheckInput) => {
    return octokit.checks.create({
        headers: {
            accept: "application/vnd.github.v3+json"
        },
        owner: createCheckDetails.owner,
        repo: createCheckDetails.repo,
        name: "Template Config schema validation",
        head_sha: createCheckDetails.sha,
        status: "queued",
        output: {
        title: "Queuing Template schema validation",
        summary: "The validation will run shortly"
        }
    })
}

  export const resolveCheckRun = async (octokit: OctokitInstance, input: UpdateCheckInput) => {
    try {
      return octokit.checks.update({
        headers: {
          accept: "application/vnd.github.v3+json"
        },
        owner: input.owner,
        repo: input.repo,
        name: "Template Config schema validation",
        check_run_id: input.check_run_id,
        status: "completed",
        head_sha: input.sha,
        conclusion: input.result,
        output: {
          title: "Template config validated",
          summary: "Result is " + input.result,
        },
      })
  
    } catch (error: unknown) {
      console.log("There has been an error", error)
      return undefined
    }
  }