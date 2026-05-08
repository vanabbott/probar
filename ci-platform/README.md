# ci-platform

Cluster-side resources that run in the `ci` namespace.

## Apply order

```
00-namespace.yaml                       # ci namespace
01-rbac.yaml                            # SAs and Roles for poller + builder
02-secrets.example.yaml                 # template — DO NOT apply as-is
03-harbor-ca-configmap.yaml.example     # template — DO NOT apply as-is
10-buildkit-config.yaml                 # buildkitd.toml
11-buildkit-statefulset.yaml            # rootless BuildKit daemon
12-buildkit-service.yaml                # headless service for buildkitd
20-workflowtemplate-go-build.yaml       # the build pipeline
30-cronworkflow-poller.yaml             # the every-minute poll loop
```

## Files marked `.example`

These have placeholders. Either:

1. Generate them imperatively with `kubectl create ... --dry-run=client -o yaml`
   and apply (see top-level README for exact commands), or
2. Manage via SealedSecrets / External Secrets Operator if that's your
   pattern elsewhere.

Real values should never be committed to git.

## What lives where

| Resource                  | Purpose                                                          |
|---------------------------|------------------------------------------------------------------|
| `buildkitd` StatefulSet   | Rootless BuildKit daemon. One replica. PVC-backed cache.         |
| `buildkitd` Service       | Headless ClusterIP. Reached by workflow steps as `buildkitd.ci.svc:1234`. |
| `go-build-and-push` WT    | The pipeline. Test → build/push → sign → scan-gate.              |
| `poll-goapp-repo` CWF     | `git ls-remote` every minute, submits Workflows on SHA change.   |
| `goapp-poller-state` CM   | Auto-created by the poller. Stores last-seen SHA.                |
| `harbor-dockerconfig`     | Docker config for buildkit/cosign push.                          |
| `harbor-api`              | Basic auth for the scan-gate API call.                           |
| `cosign-key`              | Cosign private key + password.                                   |
| `harbor-ca`               | Internal CA bundle so all components trust harbor.k8s.home.      |

## Adding more apps later

The `go-build-and-push` WorkflowTemplate is generic. To add a second Go
app, copy `30-cronworkflow-poller.yaml` and change:

- `metadata.name` (e.g., `poll-otherapp-repo`)
- `arguments.parameters.repo-url`
- `arguments.parameters.state-configmap`
- `arguments.parameters.image-name`

That's it. The template handles the build.

For a non-Go app, write a new `WorkflowTemplate` (e.g.,
`node-build-and-push`) that follows the same shape — checkout → test →
buildctl → cosign → scan-gate. The buildkitd, secrets, and CA setup
are all reusable.
