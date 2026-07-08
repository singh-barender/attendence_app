/**
 * `identify` — looks a user up by email (the account lookup key, ADR-004)
 * and reports which biometric methods they've enrolled, so the client knows
 * which punch-in buttons to show.
 */
import * as enrollmentService from '../../services/enrollmentService';
import * as userService from '../../services/userService';
import { builder } from '../builder';

export interface IdentifyResultShape {
  userId: string;
  fullName: string;
  faceEnrolled: boolean;
  fingerprintEnrolled: boolean;
}

const IdentifyResult = builder.objectRef<IdentifyResultShape>('IdentifyResult').implement({
  fields: (t) => ({
    userId: t.exposeID('userId'),
    fullName: t.exposeString('fullName'),
    faceEnrolled: t.exposeBoolean('faceEnrolled'),
    fingerprintEnrolled: t.exposeBoolean('fingerprintEnrolled'),
  }),
});

builder.queryField('identify', (t) =>
  t.field({
    type: IdentifyResult,
    args: {
      email: t.arg.string({ required: true }),
    },
    resolve: async (_root, args): Promise<IdentifyResultShape> => {
      const user = await userService.findUserByEmail(args.email);
      const status = await enrollmentService.getEnrollmentStatus(user.id);
      return {
        userId: user.id,
        fullName: user.fullName,
        ...status,
      };
    },
  }),
);
