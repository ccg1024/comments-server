import fastify from "fastify"
import sensible from "@fastify/sensible"
import cors from "@fastify/cors"
import cookie from "@fastify/cookie"
import dotenv from "dotenv"
import { PrismaClient } from "@prisma/client"
dotenv.config()

const app = fastify()
app.register(sensible)
app.register(cookie, { secret: "my-secret" })
app.register(cors, {
  origin: process.env.CLIENT_URL,
  credentials: true, // for cookie
})

// set the cookie to browser
// the userId always set to Kyle
app.addHook("onRequest", (req, res, done) => {
  if (req.cookies.userId !== CURRENT_USER_ID) {
    // req.cookies.userId = CURRENT_USER_ID
    // res.clearCookie("userId")
    // res.setCookie("userId", CURRENT_USER_ID)
    // console.log("res")
  }
  done()
})
const prisma = new PrismaClient()
const CURRENT_USER_ID = (
  await prisma.user.findFirst({
    where: { name: "Kyle" },
  })
).id
const COMMENT_SELECT_FIELDS = {
  id: true,
  message: true,
  parentId: true,
  createAt: true,
  user: {
    select: {
      id: true,
      name: true,
    },
  },
}

app.post("/logout", async (req, res) => {
  if (req.cookies.userName) {
    res.clearCookie("userName")
    res.clearCookie("userId")
  }
  return "logout"
})

app.post("/login", async (req, res) => {
  // console.log(req.body.username)
  // console.log(req.body.password)
  // res.setCookie("userId", CURRENT_USER_ID)
  const user = await prisma.user.findFirst({
    where: { name: req.body.username },
    select: { id: true, name: true, pswd: true },
  })

  if (user === null) {
    return res.send(app.httpErrors.badRequest("The username is not exist"))
  }

  if (user.pswd !== req.body.password) {
    return res.send(app.httpErrors.badRequest("The passwrod is not correct"))
  }

  res.clearCookie("userId")
  res.setCookie("userName", user.name)
  res.setCookie("userId", user.id)

  return {
    id: user.id,
    name: user.name,
  }
})

app.get("/posts", async (req, res) => {
  const posts = await commitToDb(
    prisma.post.findMany({
      select: {
        id: true,
        title: true,
        createAt: true,
        body: true,
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })
  )
  return posts.map((post) => {
    return {
      ...post,
      body:
        post.body.length > 100
          ? post.body.substring(0, 100) + "..."
          : post.body,
    }
  })
})

app.get("/posts/:id", async (req, res) => {
  return await commitToDb(
    prisma.post
      .findUnique({
        where: { id: req.params.id },
        select: {
          body: true,
          title: true,
          createAt: true,
          comments: {
            orderBy: {
              createAt: "desc",
            },
            select: {
              ...COMMENT_SELECT_FIELDS,
              _count: { select: { likes: true } },
            },
          },
          user: {
            select: {
              name: true,
            },
          },
        },
      })
      .then(async (post) => {
        const likes = await prisma.like.findMany({
          where: {
            userId: req.cookies.userId,
            commentId: { in: post.comments.map((comment) => comment.id) },
          },
        })

        return {
          ...post,
          comments: post.comments.map((comment) => {
            const { _count, ...commentFields } = comment
            return {
              ...commentFields,
              likedByMe: likes.find((like) => like.commentId === comment.id),
              likeCount: _count.likes,
            }
          }),
        }
      })
  )
})

app.post("/posts/:id/comments", async (req, res) => {
  if (req.body.message === "" || req.body.message === null) {
    return res.send(app.httpErrors.badRequest("Message is requried"))
  }

  if (req.cookies.userId === null || req.cookies.userId === undefined) {
    return res.send(app.httpErrors.badRequest("Please log in frist"))
  }

  return await commitToDb(
    prisma.comment
      .create({
        data: {
          message: req.body.message,
          userId: req.cookies.userId,
          parentId: req.body.parentId,
          postId: req.params.id,
        },
        select: COMMENT_SELECT_FIELDS,
      })
      .then((comment) => {
        return {
          ...comment,
          likeCount: 0,
          likedByMe: false,
        }
      })
  )
})

app.put("/posts/:postId/comments/:commentId", async (req, res) => {
  if (req.cookies.userId === undefined || req.cookies.userId === null) {
    return res.send(app.httpErrors.badRequest("Please log in first."))
  }
  if (req.body.message === "" || req.body.message === null) {
    return res.send(app.httpErrors.badRequest("Message is requried"))
  }

  const { userId } = await prisma.comment.findUnique({
    where: { id: req.params.commentId },
    select: { userId: true },
  })
  if (userId !== req.cookies.userId) {
    return res.send(
      app.httpErrors.unauthorized(
        "You do not have permission to edit this message"
      )
    )
  }

  return await commitToDb(
    prisma.comment.update({
      where: { id: req.params.commentId },
      data: { message: req.body.message },
      select: { message: true },
    })
  )
})

app.delete("/posts/:postId/comments/:commentId", async (req, res) => {
  if (req.cookies.userId === undefined || req.cookies.userId === null) {
    return res.send(app.httpErrors.badRequest("Please log in first."))
  }

  const { userId } = await prisma.comment.findUnique({
    where: { id: req.params.commentId },
    select: { userId: true },
  })
  if (userId !== req.cookies.userId) {
    return res.send(
      app.httpErrors.unauthorized(
        "You do not have permission to delete this message"
      )
    )
  }

  return await commitToDb(
    prisma.comment.delete({
      where: { id: req.params.commentId },
      select: { id: true },
    })
  )
})

app.post("/posts/:postId/comments/:commentId/toggleLike", async (req, res) => {
  if (req.cookies.userId === undefined || req.cookies.userId === null) {
    return res.send(app.httpErrors.badRequest("Please log in first."))
  }
  const data = {
    commentId: req.params.commentId,
    userId: req.cookies.userId,
  }

  const like = await prisma.like.findFirst({
    where: {
      userId: data.userId,
      commentId: data.commentId,
    },
  })
  if (like === null) {
    return await commitToDb(prisma.like.create({ data })).then(() => {
      return { addLike: true }
    })
  } else {
    return await commitToDb(
      prisma.like.deleteMany({
        where: { userId: data.userId, commentId: data.commentId },
      })
    )
  }
})

async function commitToDb(promise) {
  const [error, data] = await app.to(promise)
  if (error) return app.httpErrors.internalServerError(error.message)

  return data
}

app.listen({ port: process.env.PORT })
