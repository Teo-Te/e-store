import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { compareSync } from "bcrypt-ts-edge";
import type { NextAuthConfig } from "next-auth";
import { prisma } from "@/lib/prisma-init-component";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const config = {
  pages: {
    signIn: "/sign-in",
    error: "/sign-in",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      credentials: {
        email: { type: "email" },
        password: { type: "password" },
      },
      async authorize(credentials) {
        if (credentials === null) return null;

        const user = await prisma.user.findFirst({
          where: {
            email: credentials.email as string,
          },
        });

        if (user && user.password) {
          const isMatch = compareSync(
            credentials.password as string,
            user.password
          );

          // Check if password is correct
          if (isMatch) {
            return {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
            };
          }
        }

        return null;
      },
    }),
  ],
  callbacks: {
    async session({ session, user, trigger, token }: any) {
      // Set user Id from token
      session.user.id = token.sub;
      session.user.role = token.role;
      session.user.name = token.name;

      // If there is an update, set the user name
      if (trigger === "update") {
        session.user.name = user.name;
      }

      return session;
    },
    async jwt({ token, user, trigger, session }: any) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        // If user has no name lets use the email
        if (user.name === "NO_NAME") token.name === user.email!.split("@")[0];

        // Updating database to reflect the token name
        await prisma.user.update({
          where: { id: user.id },
          data: { name: token.name },
        });
      }

      if (trigger === "signIn" || trigger === "signUp") {
        const cookiesObj = await cookies();
        const sessionCartId = cookiesObj.get("seessionCartId")?.value;

        if (sessionCartId) {
          const sessionCart = await prisma.cart.findFirst({
            where: { sessionCartId },
          });
          if (sessionCart) {
            // Delete current user cart
            await prisma.cart.deleteMany({
              where: { userId: user.id },
            });

            // Update with new cart
            await prisma.cart.update({
              where: { id: sessionCart.id },
              data: { userId: user.id },
            });
          }
        }
      }

      if (session?.user.name && trigger === "update") {
        token.name = session.user.name;
      }
      return token;
    },
    authorized({ request, auth }: any) {
      // Array of regex patterns or paths to protect,
      const protectedPaths = [
        /\/shipping-address/,
        /\/payment-method/,
        /\/place-order/,
        /\/profile/,
        /\/user\/(.*)/,
        /\/order\/(.*)/,
        /\/admin\/(.*)/,
      ];

      // Get pathhnames
      const { pathname } = request.nextUrl;

      // Check if user not authenticated and accessing protected paths
      if (!auth && protectedPaths.some((p) => p.test(pathname))) return false;

      // Check for session cart cookie
      if (!request.cookies.get("sessionCartId")) {
        // Generate new session cart Id cookie
        const sessionCartId = crypto.randomUUID();

        // Clone req headers
        const newRequestHeaders = new Headers(request.headers);

        // Create a new res and add the headers
        const res = NextResponse.next({
          request: {
            headers: newRequestHeaders,
          },
        });

        // Set newly generated session cart id in the response cookies.
        res.cookies.set("sessionCartId", sessionCartId);

        return res;
      } else {
        return true;
      }
    },
  },
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(config);
