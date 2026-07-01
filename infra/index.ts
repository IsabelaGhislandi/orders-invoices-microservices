import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as docker from "@pulumi/docker-build";

const ordersECRRepository = new awsx.ecr.Repository("orders-ecr", {
    forceDelete: true,
});

const ordersECRToken = aws.ecr.getAuthorizationTokenOutput({
    registryId: ordersECRRepository.repository.registryId,
});

export const ordersImage = new docker.Image("orders-image", {
    tags: [
        pulumi.interpolate`${ordersECRRepository.repository.repositoryUrl}:latest`,
    ],
    context: {
        location: "../app-orders",
    },
    push: true,
    platforms: [ "linux/amd64" ],
    // Usa o `docker buildx` do host (builder já rodando) em vez de bootar
    // um builder interno — evita o erro "booting builder: context deadline exceeded".
    exec: true,
    registries: [
        {
            address: ordersECRRepository.repository.repositoryUrl,
            username: ordersECRToken.userName,
            password: ordersECRToken.password,
        },
    ],
});

const cluster = new awsx.classic.ecs.Cluster("app-cluster");

const ordersService = new awsx.classic.ecs.FargateService("fargate-orders", {
    cluster,
    desiredCount: 1, // quantas instâncias do serviço desejamos
    waitForSteadyState: false, // não aguardar o serviço atingir steady state
    taskDefinitionArgs: {
        container: {
            image: ordersImage.ref,
            cpu: 256,
            memory: 512,
        },
    },
});