/**
 * `identify` — looks a user up by email (the account lookup key, ADR-004)
 * and reports which biometric methods they've enrolled, so the client knows
 * which punch-in buttons to show. Also exposes `registrationStep` (1|2|3,
 * `User.registrationStep`) so the client can resume an incomplete
 * registration wizard — without it, a user who dropped off after Step 1/2
 * has no way back into the wizard and their email is stuck unusable.
 */
import * as enrollmentService from '../../services/enrollmentService';
import * as userService from '../../services/userService';
import { builder } from '../builder';

export interface IdentifyResultShape {
  userId: string;
  fullName: string;
  faceEnrolled: boolean;
  fingerprintEnrolled: boolean;
  registrationStep: number;
}

const IdentifyResult = builder.objectRef<IdentifyResultShape>('IdentifyResult').implement({
  fields: (t) => ({
    userId: t.exposeID('userId'),
    fullName: t.exposeString('fullName'),
    faceEnrolled: t.exposeBoolean('faceEnrolled'),
    fingerprintEnrolled: t.exposeBoolean('fingerprintEnrolled'),
    registrationStep: t.exposeInt('registrationStep'),
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
        registrationStep: user.registrationStep,
        ...status,
      };
    },
  }),
);
