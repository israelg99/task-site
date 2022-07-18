#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("source-map-support/register");
const cdk = require("aws-cdk-lib");
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_ec2_1 = require("aws-cdk-lib/aws-ec2");
const aws_ecs_1 = require("aws-cdk-lib/aws-ecs");
const aws_autoscaling_1 = require("aws-cdk-lib/aws-autoscaling");
const path = require("path");
const constructs_1 = require("constructs");
const aws_logs_1 = require("aws-cdk-lib/aws-logs");
const aws_route53_1 = require("aws-cdk-lib/aws-route53");
const aws_certificatemanager_1 = require("aws-cdk-lib/aws-certificatemanager");
const aws_ecs_patterns_1 = require("aws-cdk-lib/aws-ecs-patterns");
const aws_route53_targets_1 = require("aws-cdk-lib/aws-route53-targets");
const aws_ecr_1 = require("aws-cdk-lib/aws-ecr");
const aws_ecs_2 = require("aws-cdk-lib/aws-ecs");
const root = path.join(__dirname, `..`);
const app = new cdk.App();
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION };
const vpcStack = new aws_cdk_lib_1.Stack(app, 'vpc', { env });
const vpc = new aws_ec2_1.Vpc(vpcStack, 'vpc', {
    flowLogs: {
        FlowLogCloudWatch: {
            trafficType: aws_ec2_1.FlowLogTrafficType.ALL,
            destination: aws_ec2_1.FlowLogDestination.toCloudWatchLogs(),
        },
    },
    natGateways: 1,
    maxAzs: 3,
});
const ecsStack = new aws_cdk_lib_1.Stack(app, 'ecs-c7g-large', { env });
const cluster = new aws_ecs_1.Cluster(ecsStack, 'ecs', {
    vpc,
    clusterName: 'ecs-c7g-large',
    containerInsights: true,
});
cluster.connections.allowFromAnyIpv4(aws_ec2_1.Port.tcp(80));
cluster.connections.allowToAnyIpv4(aws_ec2_1.Port.tcp(80));
const type = "c7g.large";
const INSTANCE = aws_ec2_1.InstanceType.of(aws_ec2_1.InstanceClass.C7G, aws_ec2_1.InstanceSize.LARGE);
const asg = new aws_autoscaling_1.AutoScalingGroup(ecsStack, "AutoScalingGroup", {
    autoScalingGroupName: "EcsC7gLargeAutoScalingGroup",
    instanceType: INSTANCE,
    vpc,
    groupMetrics: [aws_autoscaling_1.GroupMetrics.all()],
    minCapacity: 1,
    maxCapacity: 1,
    machineImage: aws_ecs_1.EcsOptimizedImage.amazonLinux2(aws_ecs_2.AmiHardwareType.ARM),
    associatePublicIpAddress: true,
    vpcSubnets: {
        subnetType: aws_ec2_1.SubnetType.PUBLIC
    },
    allowAllOutbound: true,
});
const asgCapacityProvider = new aws_ecs_1.AsgCapacityProvider(ecsStack, `asgCapacityProvider`, {
    autoScalingGroup: asg,
    // canContainersAccessInstanceRole: true,
    capacityProviderName: `C7gLargeAsgCapacityProvider`,
});
cluster.addAsgCapacityProvider(asgCapacityProvider);
asgCapacityProvider.autoScalingGroup.connections.allowFromAnyIpv4(aws_ec2_1.Port.allTcp());
asgCapacityProvider.autoScalingGroup.connections.allowToAnyIpv4(aws_ec2_1.Port.allTcp());
const domain = process.env.DOMAIN;
class Service extends constructs_1.Construct {
    constructor(scope, id, props) {
        var _a;
        super(scope, id);
        const service = props.name;
        const service_cased = service.charAt(0).toUpperCase() + service.slice(1);
        const service_name = `${service}-service`;
        // const asset = new DockerImageAsset(this, `Image`, {
        //     directory: path.join(root, service),
        //     buildArgs: {
        //         ARCH: INSTANCE.architecture === InstanceArchitecture.ARM_64 ? "arm64" : "amd64",
        //     }
        // });
        // new CfnOutput(this, `ImageUriEcrCfnOut`, {
        //     value: asset.imageUri,
        //     exportName: `${service_cased}ImageUriECR`,
        //     description: `Image URI from ECR`,
        // });
        // const instanceType = props.instanceType || "c7g.large";
        //
        // const placementConstraints = instanceType
        //     ? [
        //         PlacementConstraint.memberOf(
        //             `attribute:ecs.instance-type == ${instanceType}`
        //         ),
        //     ]
        //     : [];
        const taskDefinition = new aws_ecs_1.Ec2TaskDefinition(this, "TaskDef", {
            family: service_name,
        });
        taskDefinition.addContainer("Container", {
            image: aws_ecs_1.ContainerImage.fromEcrRepository(aws_ecr_1.Repository.fromRepositoryName(this, `${service}-ecr`, `${service}`)),
            portMappings: [
                {
                    containerPort: 80,
                    protocol: aws_ecs_1.Protocol.TCP,
                },
            ],
            containerName: service_name,
            environment: {
                AWS_REGION: process.env.AWS_REGION,
                AWS_DEFAULT_REGION: process.env.AWS_REGION,
                AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
                AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
                S3_BUCKET: process.env.S3_BUCKET,
                DYNDB_TABLE: process.env.DYNDB_TABLE,
            },
            memoryReservationMiB: 2048,
            logging: new aws_ecs_1.AwsLogDriver({
                streamPrefix: service_name,
                logRetention: aws_logs_1.RetentionDays.ONE_WEEK,
            }),
        });
        let certificate = undefined;
        let hostedZone = undefined;
        if (props.domain) {
            hostedZone = aws_route53_1.HostedZone.fromLookup(this, `HostedZone`, {
                domainName: props.domain,
            });
            certificate = new aws_certificatemanager_1.Certificate(this, "Certificate", {
                domainName: `*.${props.domain}`,
                validation: aws_certificatemanager_1.CertificateValidation.fromDns(hostedZone),
            });
        }
        const loadBalancedEcsService = new aws_ecs_patterns_1.ApplicationLoadBalancedEc2Service(this, `Service`, {
            cluster,
            serviceName: service_name,
            loadBalancerName: `${service}-load-balancer`,
            desiredCount: 1,
            certificate,
            enableECSManagedTags: true,
            maxHealthyPercent: 400,
            minHealthyPercent: 100,
            // placementConstraints: placementConstraints,
            propagateTags: aws_ecs_1.PropagatedTagSource.TASK_DEFINITION,
            memoryReservationMiB: 2048,
            publicLoadBalancer: true,
            taskDefinition,
            healthCheckGracePeriod: props.timeout || aws_cdk_lib_1.Duration.seconds(60),
        });
        loadBalancedEcsService.listener.connections.allowFromAnyIpv4(aws_ec2_1.Port.allTcp());
        loadBalancedEcsService.listener.connections.allowToAnyIpv4(aws_ec2_1.Port.allTcp());
        loadBalancedEcsService.targetGroup.configureHealthCheck((_a = props.healthCheck) !== null && _a !== void 0 ? _a : {
            path: `/ping`,
        });
        if (hostedZone && loadBalancedEcsService.loadBalancer && certificate) {
            new aws_route53_1.ARecord(this, "DnsRecord", {
                recordName: service,
                zone: hostedZone,
                target: aws_route53_1.RecordTarget.fromAlias(new aws_route53_targets_1.LoadBalancerTarget(loadBalancedEcsService.loadBalancer)),
                ttl: aws_cdk_lib_1.Duration.minutes(1),
            });
        }
    }
}
let stack = new aws_cdk_lib_1.Stack(app, "task-site-service", {
    env,
    description: `Task site service`,
});
new Service(stack, "service", {
    name: "task-site",
    vpc,
    cluster
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2RrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLHVDQUFxQztBQUNyQyxtQ0FBbUM7QUFDbkMsNkNBQXVEO0FBQ3ZELGlEQVM2QjtBQUM3QixpREFVNkI7QUFDN0IsaUVBQTJFO0FBQzNFLDZCQUE2QjtBQUU3QiwyQ0FBcUM7QUFDckMsbURBQW1EO0FBQ25ELHlEQUEwRTtBQUMxRSwrRUFBc0Y7QUFDdEYsbUVBQStFO0FBQy9FLHlFQUFtRTtBQUduRSxpREFBK0M7QUFDL0MsaURBQW9EO0FBRXBELE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO0FBRXhDLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBQzFCLE1BQU0sR0FBRyxHQUFHLEVBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLEVBQUMsQ0FBQztBQUUvRixNQUFNLFFBQVEsR0FBRyxJQUFJLG1CQUFLLENBQUMsR0FBRyxFQUFFLEtBQUssRUFBRSxFQUFDLEdBQUcsRUFBQyxDQUFDLENBQUM7QUFDOUMsTUFBTSxHQUFHLEdBQUcsSUFBSSxhQUFHLENBQUMsUUFBUSxFQUFFLEtBQUssRUFBRTtJQUNqQyxRQUFRLEVBQUU7UUFDTixpQkFBaUIsRUFBRTtZQUNmLFdBQVcsRUFBRSw0QkFBa0IsQ0FBQyxHQUFHO1lBQ25DLFdBQVcsRUFBRSw0QkFBa0IsQ0FBQyxnQkFBZ0IsRUFBRTtTQUNyRDtLQUNKO0lBQ0QsV0FBVyxFQUFFLENBQUM7SUFDZCxNQUFNLEVBQUUsQ0FBQztDQUNaLENBQUMsQ0FBQztBQUVILE1BQU0sUUFBUSxHQUFHLElBQUksbUJBQUssQ0FBQyxHQUFHLEVBQUUsZUFBZSxFQUFFLEVBQUMsR0FBRyxFQUFDLENB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QUU7Z0JBQzNCLFVBQVUsRUFBRSxPQUFPO2dCQUNuQixJQUFJLEVBQUUsVUFBVTtnQkFDaEIsTUFBTSxFQUFFLDBCQUFZLENBQUMsU0FBUyxDQUMxQixJQUFJLHdDQUFrQixDQUFDLHNCQUFzQixDQUFDLFlBQVksQ0FBQyxDQUM5RDtnQkFDRCxHQUFHLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO2FBQzNCLENBQUMsQ0FBQztTQUNOO0lBQ0wsQ0FBQztDQUNKO0FBRUQsSUFBSSxLQUFLLEdBQUcsSUFBSSxtQkFBSyxDQUFDLEdBQUcsRUFBRSxtQkFBbUIsRUFBRTtJQUM1QyxHQUFHO0lBQ0gsV0FBVyxFQUFFLG1CQUFtQjtDQUNuQyxDQUFDLENBQUM7QUFDSCxJQUFJLE9BQU8sQ0FBQyxLQUFLLEVBQUUsU0FBUyxFQUFFO0lBQzFCLElBQUksRUFBRSxXQUFXO0lBQ2pCLEdBQUc7SUFDSCxPQUFPO0NBQ1YsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0ICdzb3VyY2UtbWFwLXN1cHBvcnQvcmVnaXN0ZXInO1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7Q2ZuT3V0cHV0LCBEdXJhdGlvbiwgU3RhY2t9IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7XG4gICAgQW1hem9uTGludXhDcHVUeXBlLFxuICAgIEFtYXpvbkxpbnV4R2VuZXJhdGlvbiwgQW1hem9uTGludXhJbWFnZSwgRmxvd0xvZ0Rlc3RpbmF0aW9uLCBGbG93TG9nVHJhZmZpY1R5cGUsIEluc3RhbmNlQ2xhc3MsIEluc3RhbmNlU2l6ZSxcbiAgICBJbnN0YW5jZVR5cGUsXG4gICAgSVZwYyxcbiAgICBNYWNoaW5lSW1hZ2UsXG4gICAgUG9ydCxcbiAgICBTdWJuZXRUeXBlLFxuICAgIFZwY1xufSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWVjMlwiO1xuaW1wb3J0IHtcbiAgICBBc2dDYXBhY2l0eVByb3ZpZGVyLFxuICAgIEF3c0xvZ0RyaXZlcixcbiAgICBDbHVzdGVyLFxuICAgIENvbnRhaW5lckltYWdlLFxuICAgIEVjMlRhc2tEZWZpbml0aW9uLCBFY3NPcHRpbWl6ZWRJbWFnZSxcbiAgICBIZWFsdGhDaGVjayxcbiAgICBQbGFjZW1lbnRDb25zdHJhaW50LFxuICAgIFByb3BhZ2F0ZWRUYWdTb3VyY2UsXG4gICAgUHJvdG9jb2xcbn0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1lY3NcIjtcbmltcG9ydCB7QXV0b1NjYWxpbmdHcm91cCwgR3JvdXBNZXRyaWNzfSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWF1dG9zY2FsaW5nXCI7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gXCJwYXRoXCI7XG5pbXBvcnQge0lDbHVzdGVyfSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWVrc1wiO1xuaW1wb3J0IHtDb25zdHJ1Y3R9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5pbXBvcnQge1JldGVudGlvbkRheXN9IGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtbG9nc1wiO1xuaW1wb3J0IHtBUmVjb3JkLCBIb3N0ZWRab25lLCBSZWNvcmRUYXJnZXR9IGZyb20gXCJhd3MtY2RrLWxpYi9hd3Mtcm91dGU1M1wiO1xuaW1wb3J0IHtDZXJ0aWZpY2F0ZSwgQ2VydGlmaWNhdGVWYWxpZGF0aW9ufSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWNlcnRpZmljYXRlbWFuYWdlclwiO1xuaW1wb3J0IHtBcHBsaWNhdGlvbkxvYWRCYWxhbmNlZEVjMlNlcnZpY2V9IGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtZWNzLXBhdHRlcm5zXCI7XG5pbXBvcnQge0xvYWRCYWxhbmNlclRhcmdldH0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1yb3V0ZTUzLXRhcmdldHNcIjtcbmltcG9ydCB7RG9ja2VySW1hZ2VBc3NldCwgUGxhdGZvcm19IGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtZWNyLWFzc2V0c1wiO1xuaW1wb3J0IHtJbnN0YW5jZUFyY2hpdGVjdHVyZX0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1lYzJcIjtcbmltcG9ydCB7UmVwb3NpdG9yeX0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1lY3JcIjtcbmltcG9ydCB7QW1pSGFyZHdhcmVUeXBlfSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWVjc1wiO1xuXG5jb25zdCByb290ID0gcGF0aC5qb2luKF9fZGlybmFtZSwgYC4uYCk7XG5cbmNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XG5jb25zdCBlbnYgPSB7YWNjb3VudDogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCwgcmVnaW9uOiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9SRUdJT059O1xuXG5jb25zdCB2cGNTdGFjayA9IG5ldyBTdGFjayhhcHAsICd2cGMnLCB7ZW52fSk7XG5jb25zdCB2cGMgPSBuZXcgVnBjKHZwY1N0YWNrLCAndnBjJywge1xuICAgIGZsb3dMb2dzOiB7XG4gICAgICAgIEZsb3dMb2dDbG91ZFdhdGNoOiB7XG4gICAgICAgICAgICB0cmFmZmljVHlwZTogRmxvd0xvZ1RyYWZmaWNUeXBlLkFMTCxcbiAgICAgICAgICAgIGRlc3RpbmF0aW9uOiBGbG93TG9nRGVzdGluYXRpb24udG9DbG91ZFdhdGNoTG9ncygpLFxuICAgICAgICB9LFxuICAgIH0sXG4gICAgbmF0R2F0ZXdheXM6IDEsXG4gICAgbWF4QXpzOiAzLFxufSk7XG5cbmNvbnN0IGVjc1N0YWNrID0gbmV3IFN0YWNrKGFwcCwgJ2Vjcy1jN2ctbGFyZ2UnLCB7ZW52fSk7XG5jb25zdCBjbHVzdGVyID0gbmV3IENsdXN0ZXIoZWNzU3RhY2ssICdlY3MnLCB7XG4gICAgdnBjLFxuICAgIGNsdXN0ZXJOYW1lOiAnZWNzLWM3Zy1sYXJnZScsXG4gICAgY29udGFpbmVySW5zaWdodHM6IHRydWUsXG59KTtcbmNsdXN0ZXIuY29ubmVjdGlvbnMuYWxsb3dGcm9tQW55SXB2NChQb3J0LnRjcCg4MCkpO1xuY2x1c3Rlci5jb25uZWN0aW9ucy5hbGxvd1RvQW55SXB2NChQb3J0LnRjcCg4MCkpO1xuXG5jb25zdCB0eXBlID0gXCJjN2cubGFyZ2VcIjtcblxuY29uc3QgSU5TVEFOQ0UgPSBJbnN0YW5jZVR5cGUub2YoSW5zdGFuY2VDbGFzcy5DN0csIEluc3RhbmNlU2l6ZS5MQVJHRSlcblxuY29uc3QgYXNnID0gbmV3IEF1dG9TY2FsaW5nR3JvdXAoZWNzU3RhY2ssIFwiQXV0b1NjYWxpbmdHcm91cFwiLCB7XG4gICAgYXV0b1NjYWxpbmdHcm91cE5hbWU6IFwiRWNzQzdnTGFyZ2VBdXRvU2NhbGluZ0dyb3VwXCIsXG4gICAgaW5zdGFuY2VUeXBlOiBJTlNUQU5DRSxcbiAgICB2cGMsXG4gICAgZ3JvdXBNZXRyaWNzOiBbR3JvdXBNZXRyaWNzLmFsbCgpXSxcbiAgICBtaW5DYXBhY2l0eTogMSxcbiAgICBtYXhDYXBhY2l0eTogMSxcbiAgICBtYWNoaW5lSW1hZ2U6IEVjc09wdGltaXplZEltYWdlLmFtYXpvbkxpbnV4MihcbiAgICAgICAgQW1pSGFyZHdhcmVUeXBlLkFSTSxcbiAgICApLFxuICAgIGFzc29jaWF0ZVB1YmxpY0lwQWRkcmVzczogdHJ1ZSxcbiAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgIHN1Ym5ldFR5cGU6IFN1Ym5ldFR5cGUuUFVCTElDXG4gICAgfSxcbiAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlLFxufSk7XG5jb25zdCBhc2dDYXBhY2l0eVByb3ZpZGVyID0gbmV3IEFzZ0NhcGFjaXR5UHJvdmlkZXIoZWNzU3RhY2ssIGBhc2dDYXBhY2l0eVByb3ZpZGVyYCwge1xuICAgIGF1dG9TY2FsaW5nR3JvdXA6IGFzZyxcbiAgICAvLyBjYW5Db250YWluZXJzQWNjZXNzSW5zdGFuY2VSb2xlOiB0cnVlLFxuICAgIGNhcGFjaXR5UHJvdmlkZXJOYW1lOiBgQzdnTGFyZ2VBc2dDYXBhY2l0eVByb3ZpZGVyYCxcbn0pO1xuY2x1c3Rlci5hZGRBc2dDYXBhY2l0eVByb3ZpZGVyKGFzZ0NhcGFjaXR5UHJvdmlkZXIpO1xuYXNnQ2FwYWNpdHlQcm92aWRlci5hdXRvU2NhbGluZ0dyb3VwLmNvbm5lY3Rpb25zLmFsbG93RnJvbUFueUlwdjQoUG9ydC5hbGxUY3AoKSk7XG5hc2dDYXBhY2l0eVByb3ZpZGVyLmF1dG9TY2FsaW5nR3JvdXAuY29ubmVjdGlvbnMuYWxsb3dUb0FueUlwdjQoUG9ydC5hbGxUY3AoKSk7XG5cbmNvbnN0IGRvbWFpbiA9IHByb2Nlc3MuZW52LkRPTUFJTjtcblxuaW50ZXJmYWNlIEluZmVyZW5jZVNlcnZpY2VQcm9wcyB7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIHZwYzogSVZwYyB8IFZwYztcbiAgICBjbHVzdGVyOiBJQ2x1c3RlciB8IENsdXN0ZXI7XG4gICAgaW5zdGFuY2VUeXBlPzogc3RyaW5nO1xuICAgIHRpbWVvdXQ/OiBEdXJhdGlvbjtcbiAgICBkb21haW4/OiBzdHJpbmc7XG4gICAgaGVhbHRoQ2hlY2s/OiBIZWFsdGhDaGVjaztcbn1cblxuY2xhc3MgU2VydmljZSBleHRlbmRzIENvbnN0cnVjdCB7XG4gICAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEluZmVyZW5jZVNlcnZpY2VQcm9wcykge1xuICAgICAgICBzdXBlcihzY29wZSwgaWQpO1xuICAgICAgICBjb25zdCBzZXJ2aWNlID0gcHJvcHMubmFtZTtcbiAgICAgICAgY29uc3Qgc2VydmljZV9jYXNlZCA9IHNlcnZpY2UuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBzZXJ2aWNlLnNsaWNlKDEpO1xuICAgICAgICBjb25zdCBzZXJ2aWNlX25hbWUgPSBgJHtzZXJ2aWNlfS1zZXJ2aWNlYDtcblxuICAgICAgICAvLyBjb25zdCBhc3NldCA9IG5ldyBEb2NrZXJJbWFnZUFzc2V0KHRoaXMsIGBJbWFnZWAsIHtcbiAgICAgICAgLy8gICAgIGRpcmVjdG9yeTogcGF0aC5qb2luKHJvb3QsIHNlcnZpY2UpLFxuICAgICAgICAvLyAgICAgYnVpbGRBcmdzOiB7XG4gICAgICAgIC8vICAgICAgICAgQVJDSDogSU5TVEFOQ0UuYXJjaGl0ZWN0dXJlID09PSBJbnN0YW5jZUFyY2hpdGVjdHVyZS5BUk1fNjQgPyBcImFybTY0XCIgOiBcImFtZDY0XCIsXG4gICAgICAgIC8vICAgICB9XG4gICAgICAgIC8vIH0pO1xuXG4gICAgICAgIC8vIG5ldyBDZm5PdXRwdXQodGhpcywgYEltYWdlVXJpRWNyQ2ZuT3V0YCwge1xuICAgICAgICAvLyAgICAgdmFsdWU6IGFzc2V0LmltYWdlVXJpLFxuICAgICAgICAvLyAgICAgZXhwb3J0TmFtZTogYCR7c2VydmljZV9jYXNlZH1JbWFnZVVyaUVDUmAsXG4gICAgICAgIC8vICAgICBkZXNjcmlwdGlvbjogYEltYWdlIFVSSSBmcm9tIEVDUmAsXG4gICAgICAgIC8vIH0pO1xuXG4gICAgICAgIC8vIGNvbnN0IGluc3RhbmNlVHlwZSA9IHByb3BzLmluc3RhbmNlVHlwZSB8fCBcImM3Zy5sYXJnZVwiO1xuICAgICAgICAvL1xuICAgICAgICAvLyBjb25zdCBwbGFjZW1lbnRDb25zdHJhaW50cyA9IGluc3RhbmNlVHlwZVxuICAgICAgICAvLyAgICAgPyBbXG4gICAgICAgIC8vICAgICAgICAgUGxhY2VtZW50Q29uc3RyYWludC5tZW1iZXJPZihcbiAgICAgICAgLy8gICAgICAgICAgICAgYGF0dHJpYnV0ZTplY3MuaW5zdGFuY2UtdHlwZSA9PSAke2luc3RhbmNlVHlwZX1gXG4gICAgICAgIC8vICAgICAgICAgKSxcbiAgICAgICAgLy8gICAgIF1cbiAgICAgICAgLy8gICAgIDogW107XG5cbiAgICAgICAgY29uc3QgdGFza0RlZmluaXRpb24gPSBuZXcgRWMyVGFza0RlZmluaXRpb24odGhpcywgXCJUYXNrRGVmXCIsIHtcbiAgICAgICAgICAgIGZhbWlseTogc2VydmljZV9uYW1lLFxuICAgICAgICB9KTtcblxuICAgICAgICB0YXNrRGVmaW5pdGlvbi5hZGRDb250YWluZXIoXCJDb250YWluZXJcIiwge1xuICAgICAgICAgICAgaW1hZ2U6IENvbnRhaW5lckltYWdlLmZyb21FY3JSZXBvc2l0b3J5KFJlcG9zaXRvcnkuZnJvbVJlcG9zaXRvcnlOYW1lKHRoaXMsIGAke3NlcnZpY2V9LWVjcmAsIGAke3NlcnZpY2V9YCkpLFxuICAgICAgICAgICAgcG9ydE1hcHBpbmdzOiBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBjb250YWluZXJQb3J0OiA4MCxcbiAgICAgICAgICAgICAgICAgICAgcHJvdG9jb2w6IFByb3RvY29sLlRDUCxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIGNvbnRhaW5lck5hbWU6IHNlcnZpY2VfbmFtZSxcbiAgICAgICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgICAgICAgQVdTX1JFR0lPTjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiEsXG4gICAgICAgICAgICAgICAgQVdTX0RFRkFVTFRfUkVHSU9OOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OISxcbiAgICAgICAgICAgICAgICBBV1NfQUNDRVNTX0tFWV9JRDogcHJvY2Vzcy5lbnYuQVdTX0FDQ0VTU19LRVlfSUQhLFxuICAgICAgICAgICAgICAgIEFXU19TRUNSRVRfQUNDRVNTX0tFWTogcHJvY2Vzcy5lbnYuQVdTX1NFQ1JFVF9BQ0NFU1NfS0VZISxcbiAgICAgICAgICAgICAgICBTM19CVUNLRVQ6IHByb2Nlc3MuZW52LlMzX0JVQ0tFVCEsXG4gICAgICAgICAgICAgICAgRFlOREJfVEFCTEU6IHByb2Nlc3MuZW52LkRZTkRCX1RBQkxFISxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBtZW1vcnlSZXNlcnZhdGlvbk1pQjogMjA0OCxcbiAgICAgICAgICAgIGxvZ2dpbmc6IG5ldyBBd3NMb2dEcml2ZXIoe1xuICAgICAgICAgICAgICAgIHN0cmVhbVByZWZpeDogc2VydmljZV9uYW1lLFxuICAgICAgICAgICAgICAgIGxvZ1JldGVudGlvbjogUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICB9KTtcblxuICAgICAgICBsZXQgY2VydGlmaWNhdGUgPSB1bmRlZmluZWQ7XG4gICAgICAgIGxldCBob3N0ZWRab25lID0gdW5kZWZpbmVkO1xuICAgICAgICBpZiAocHJvcHMuZG9tYWluKSB7XG4gICAgICAgICAgICBob3N0ZWRab25lID0gSG9zdGVkWm9uZS5mcm9tTG9va3VwKHRoaXMsIGBIb3N0ZWRab25lYCwge1xuICAgICAgICAgICAgICAgIGRvbWFpbk5hbWU6IHByb3BzLmRvbWFpbixcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBjZXJ0aWZpY2F0ZSA9IG5ldyBDZXJ0aWZpY2F0ZSh0aGlzLCBcIkNlcnRpZmljYXRlXCIsIHtcbiAgICAgICAgICAgICAgICBkb21haW5OYW1lOiBgKi4ke3Byb3BzLmRvbWFpbn1gLFxuICAgICAgICAgICAgICAgIHZhbGlkYXRpb246IENlcnRpZmljYXRlVmFsaWRhdGlvbi5mcm9tRG5zKGhvc3RlZFpvbmUpLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBsb2FkQmFsYW5jZWRFY3NTZXJ2aWNlID0gbmV3IEFwcGxpY2F0aW9uTG9hZEJhbGFuY2VkRWMyU2VydmljZShcbiAgICAgICAgICAgIHRoaXMsXG4gICAgICAgICAgICBgU2VydmljZWAsXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgY2x1c3RlcixcbiAgICAgICAgICAgICAgICBzZXJ2aWNlTmFtZTogc2VydmljZV9uYW1lLFxuICAgICAgICAgICAgICAgIGxvYWRCYWxhbmNlck5hbWU6IGAke3NlcnZpY2V9LWxvYWQtYmFsYW5jZXJgLFxuICAgICAgICAgICAgICAgIGRlc2lyZWRDb3VudDogMSxcbiAgICAgICAgICAgICAgICBjZXJ0aWZpY2F0ZSxcbiAgICAgICAgICAgICAgICBlbmFibGVFQ1NNYW5hZ2VkVGFnczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBtYXhIZWFsdGh5UGVyY2VudDogNDAwLFxuICAgICAgICAgICAgICAgIG1pbkhlYWx0aHlQZXJjZW50OiAxMDAsXG4gICAgICAgICAgICAgICAgLy8gcGxhY2VtZW50Q29uc3RyYWludHM6IHBsYWNlbWVudENvbnN0cmFpbnRzLFxuICAgICAgICAgICAgICAgIHByb3BhZ2F0ZVRhZ3M6IFByb3BhZ2F0ZWRUYWdTb3VyY2UuVEFTS19ERUZJTklUSU9OLFxuICAgICAgICAgICAgICAgIG1lbW9yeVJlc2VydmF0aW9uTWlCOiAyMDQ4LFxuICAgICAgICAgICAgICAgIHB1YmxpY0xvYWRCYWxhbmNlcjogdHJ1ZSxcbiAgICAgICAgICAgICAgICB0YXNrRGVmaW5pdGlvbixcbiAgICAgICAgICAgICAgICBoZWFsdGhDaGVja0dyYWNlUGVyaW9kOiBwcm9wcy50aW1lb3V0IHx8IER1cmF0aW9uLnNlY29uZHMoNjApLFxuICAgICAgICAgICAgfVxuICAgICAgICApO1xuICAgICAgICBsb2FkQmFsYW5jZWRFY3NTZXJ2aWNlLmxpc3RlbmVyLmNvbm5lY3Rpb25zLmFsbG93RnJvbUFueUlwdjQoUG9ydC5hbGxUY3AoKSk7XG4gICAgICAgIGxvYWRCYWxhbmNlZEVjc1NlcnZpY2UubGlzdGVuZXIuY29ubmVjdGlvbnMuYWxsb3dUb0FueUlwdjQoUG9ydC5hbGxUY3AoKSk7XG5cbiAgICAgICAgbG9hZEJhbGFuY2VkRWNzU2VydmljZS50YXJnZXRHcm91cC5jb25maWd1cmVIZWFsdGhDaGVjayhwcm9wcy5oZWFsdGhDaGVjayA/PyB7XG4gICAgICAgICAgICBwYXRoOiBgL3BpbmdgLFxuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoaG9zdGVkWm9uZSAmJiBsb2FkQmFsYW5jZWRFY3NTZXJ2aWNlLmxvYWRCYWxhbmNlciAmJiBjZXJ0aWZpY2F0ZSkge1xuICAgICAgICAgICAgbmV3IEFSZWNvcmQodGhpcywgXCJEbnNSZWNvcmRcIiwge1xuICAgICAgICAgICAgICAgIHJlY29yZE5hbWU6IHNlcnZpY2UsXG4gICAgICAgICAgICAgICAgem9uZTogaG9zdGVkWm9uZSxcbiAgICAgICAgICAgICAgICB0YXJnZXQ6IFJlY29yZFRhcmdldC5mcm9tQWxpYXMoXG4gICAgICAgICAgICAgICAgICAgIG5ldyBMb2FkQmFsYW5jZXJUYXJnZXQobG9hZEJhbGFuY2VkRWNzU2VydmljZS5sb2FkQmFsYW5jZXIpXG4gICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICB0dGw6IER1cmF0aW9uLm1pbnV0ZXMoMSksXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxubGV0IHN0YWNrID0gbmV3IFN0YWNrKGFwcCwgXCJ0YXNrLXNpdGUtc2VydmljZVwiLCB7XG4gICAgZW52LFxuICAgIGRlc2NyaXB0aW9uOiBgVGFzayBzaXRlIHNlcnZpY2VgLFxufSk7XG5uZXcgU2VydmljZShzdGFjaywgXCJzZXJ2aWNlXCIsIHtcbiAgICBuYW1lOiBcInRhc2stc2l0ZVwiLFxuICAgIHZwYyxcbiAgICBjbHVzdGVyXG59KTtcbiJdfQ==