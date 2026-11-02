import {changePassword,withApiErrors} from '../../../../lib/portal-auth';
export const POST=withApiErrors(changePassword);
