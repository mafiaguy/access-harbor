import {
  SSOAdminClient,
  ListAccountAssignmentsCommand,
  CreateAccountAssignmentCommand,
  DeleteAccountAssignmentCommand,
  DescribeAccountAssignmentCreationStatusCommand,
  DescribeAccountAssignmentDeletionStatusCommand,
} from '@aws-sdk/client-sso-admin';
import { AccessConflict } from './errors.js';

export class AWSProvider {
  constructor(config, resource, identity, client) {
    this.client = client || new SSOAdminClient(config.awsOptions);
    this.resource = resource;
    this.identity = identity;
  }
  send(command) {
    return this.client.send(command, { abortSignal: AbortSignal.timeout(20000) });
  }
  args(row) {
    return {
      InstanceArn: this.resource.instanceArn,
      TargetId: this.resource.account_id,
      TargetType: 'AWS_ACCOUNT',
      PermissionSetArn: this.resource.permission_sets[row.permission],
      PrincipalType: 'USER',
      PrincipalId: this.identity.aws_user_id,
    };
  }
  async assigned(row) {
    const args = this.args(row);
    let NextToken;
    do {
      const result = await this.send(
        new ListAccountAssignmentsCommand({
          InstanceArn: args.InstanceArn,
          AccountId: args.TargetId,
          PermissionSetArn: args.PermissionSetArn,
          NextToken,
        }),
      );
      if (
        result.AccountAssignments?.some(
          (a) => a.PrincipalType === 'USER' && a.PrincipalId === args.PrincipalId,
        )
      )
        return true;
      NextToken = result.NextToken;
    } while (NextToken);
    return false;
  }
  async preflight(row) {
    if (await this.assigned(row))
      throw new AccessConflict(
        'This user already has this AWS assignment. Existing access is left untouched.',
      );
  }
  async step(action, row) {
    const args = this.args(row);
    const operation = row.operation_json ? JSON.parse(row.operation_json) : null;
    const creation = action === 'grant';
    const key = `AccountAssignment${creation ? 'Creation' : 'Deletion'}Status`;
    let status;
    if (operation) {
      if (operation.action !== action)
        throw new Error('AWS operation state does not match the requested action.');
      const Command = creation
        ? DescribeAccountAssignmentCreationStatusCommand
        : DescribeAccountAssignmentDeletionStatusCommand;
      const requestKey = `AccountAssignment${creation ? 'Creation' : 'Deletion'}RequestId`;
      const result = await this.send(
        new Command({ InstanceArn: args.InstanceArn, [requestKey]: operation.id }),
      );
      status = result[key];
    } else {
      // Reconcile after a crash between provider success and local commit.
      if ((await this.assigned(row)) === creation) return { done: true, operation: null };
      const Command = creation ? CreateAccountAssignmentCommand : DeleteAccountAssignmentCommand;
      const result = await this.send(new Command(args));
      status = result[key];
    }
    if (!status?.RequestId) throw new Error('AWS did not return an operation ID.');
    if (status.Status === 'FAILED') {
      const error = new Error(
        'AWS assignment operation failed. Check IAM Identity Center; the worker will reconcile and retry.',
      );
      error.retryOperation = true;
      throw error;
    }
    return {
      done: status.Status === 'SUCCEEDED',
      operation: status.Status === 'SUCCEEDED' ? null : { action, id: status.RequestId },
    };
  }
}
