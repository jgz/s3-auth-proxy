# s3-auth-proxy

Creates a simple basic-auth proxy for an s3 bucket. 

This is probably not secure for public use.  I built this to solve a very specific problem and its only used inside a Kubernetes cluster already running on EKS. For my purposes the auth part isn't even needed but it was easier to just use the already available [s3-basic-auth](https://www.npmjs.com/package/s3-basic-auth) package as a starting point.

Now for why I bothered to do this.

# Using [helm-s3](https://github.com/hypnoglow/helm-s3) to create a private helm chart repo that can be used with [flux2](https://github.com/fluxcd/flux2)

The problem as of this writing is that flux2 is not able to use Amazon ECR as a HelmRepository.  There are a lot of reason's why this doesn't work involving OCI I won't go into.  So that means you need to host a helm chart repository in a way that the flux2 source controller understands.

the helm-s3 plugin (using --relative) turns an s3 bucket into a helm repository and makes it easy to upload your charts in github actions,  but if you want it to be private that means there is no http access and flux2's source controller doesn't understand s3:// paths.

Enter this proxy. 

The below example is flux2 specific. 

### Set up Secrets

I didn't dig to deep into how the s3-basic-auth package works to know if it would work with just IAM roles set on the container .  So I just made a user specific to this with access to the s3 bucket it would use.

```shell
kubectl -n flux-system create secret generic s3-auth-proxy \
--from-literal=id=<AWS_SECRET_ACCESS_KEY> \
--from-literal=key=<AWS_ACCESS_KEY_ID> \
--from-literal=username=<RANDOM_STUB> \
--from-literal=password=<RANDOM_STUB> \
--dry-run=client \
-o yaml > path/to/secreats/s3-auth-proxy.yaml
```

Then if your using sops you would encrypt in place like the [flux2 guide](https://fluxcd.io/docs/guides/mozilla-sops/#encrypt-secrets) suggests.

### Deploy the proxy using the [bitnami node.js chart](https://github.com/bitnami/charts/tree/master/bitnami/node)

Make sure to update the AWS\_REGION and S3\_BUCKET extraEnvVars variables to the region and bucket your chart bucket is in.  I didn't include the declaration for the bitnami HelmRepository because if your reading this you probably already have it set up or know how to do it.

```yaml
apiVersion: helm.toolkit.fluxcd.io/v2beta1
kind: HelmRelease
metadata:
  name: s3-auth-proxy
  namespace: flux-system
spec:
  releaseName: s3-auth-proxy
  chart:
    spec:
      chart: node
      sourceRef:
        kind: HelmRepository
        name: bitnami
        namespace: flux-system
      version: "15.2.26"
  interval: 1h0m0s
  install:
    remediation:
      retries: -1
  # Default values
  # https://github.com/bitnami/charts/blob/master/bitnami/node/values.yaml
  values:
    repository: https://github.com/jgz/s3-auth-proxy
    revision: main
    nameOVerride: s3-auth-proxy
    fullnameOverride: s3-auth-proxy
    mongodb:
      enabled: false
    extraEnvVars:
      - name: AWS_ACCESS_KEY_ID
        valueFrom:
          secretKeyRef:
            name: s3-auth-proxy
            key: id
      - name: AWS_SECRET_ACCESS_KEY
        valueFrom:
          secretKeyRef:
            name: s3-auth-proxy
            key: key
      - name: PROXY_USER
        valueFrom:
          secretKeyRef:
            name: s3-auth-proxy
            key: username
      - name: PROXY_PASS
        valueFrom:
          secretKeyRef:
            name: s3-auth-proxy
            key: password
      - name: S3_BUCKET
        value: <s3-chart-bucket>.s3.amazonaws.com
      - name: AWS_REGION
        value: us-east-2
    # change probes to use the ones bult into the proxy
    livenessProbe:
      path: "/live"
    readinessProbe:
      path: "/ready"
```

### Deploy a flux2 HelmRepository  source that uses the proxy and the secret for basic-auth

```yaml
apiVersion: source.toolkit.fluxcd.io/v1beta1
kind: HelmRepository
metadata:
  name: s3-helm-repo
  namespace: flux-system
spec:
  interval: 5m
  url: http://s3-auth-proxy
  secretRef:
    name: s3-auth-proxy
```

### Build image/chart and push to ecr/s3

[This file](https://github.com/jgz/tpl-kube-ubuntu14-php5/blob/main/.github/workflows/ecr-docker-publish.yml) shows an example of how to build an image/chart then push them to ECR and an S3 helm chart repo.

NOTE:  you'll need to create the repo's in ECR before hand as well as init the chart repo in S3 as explained [here](https://github.com/hypnoglow/helm-s3#init) in the helm-s3 docs.
