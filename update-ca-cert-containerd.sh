#!/bin/bash

SSH_USER="owner"
NODES="main01 main02 main00"

for node in $NODES; do
  scp k8s-home-ca.crt ${SSH_USER}@${node}:/tmp/

  ssh -tt ${SSH_USER}@${node} "
    sudo mkdir -p /etc/containerd/certs.d/harbor.k8s.home
    sudo cp /tmp/k8s-home-ca.crt /etc/containerd/certs.d/harbor.k8s.home/ca.crt

    sudo tee /etc/containerd/certs.d/harbor.k8s.home/hosts.toml > /dev/null <<'EOF'
server = \"https://harbor.k8s.home\"

[host.\"https://harbor.k8s.home\"]
  ca = \"/etc/containerd/certs.d/harbor.k8s.home/ca.crt\"
EOF

    sudo sed -i 's|config_path = \"\"|config_path = \"/etc/containerd/certs.d\"|' /etc/containerd/config.toml

    sudo systemctl restart containerd
  "
done
