declare global {
  namespace Express {
    interface Request {
      user: {
        id: number;
        username: string;
        departmentId: number;
        department: {
          id: number;
          name: string;
          isLocked: boolean;
        };
        mustChangePwd: boolean;
      };
    }
  }
}

export {};
