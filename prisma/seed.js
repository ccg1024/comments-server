import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function seed() {
  await prisma.post.deleteMany()
  await prisma.user.deleteMany()
  const kyle = await prisma.user.create({
    data: { name: "Kyle", pswd: "123456" },
  })
  const sally = await prisma.user.create({
    data: { name: "Sally", pswd: "123456" },
  })

  const post1 = await prisma.post.create({
    data: {
      body: "As a form of art, movies can portray reality and idealism in different ways. Discussing the representation of realism and idealism in films can cover the following aspects:",
      title: "Representation of Realism and Idealism in Films",
      userId: kyle.id,
    },
  })
  const post2 = await prisma.post.create({
    data: {
      body: "As a popular cultural medium, movies have a wide-reaching influence. Discussing the impact of movies on society can include the following points",
      title: "The Influence of Movies on Society",
      userId: sally.id,
    },
  })

  const comment1 = await prisma.comment.create({
    data: {
      message: "I am a root comment",
      userId: kyle.id,
      postId: post1.id,
    },
  })
  const comment2 = await prisma.comment.create({
    data: {
      parentId: comment1.id,
      message: "I am a nested comment",
      userId: sally.id,
      postId: post1.id,
    },
  })
  const comment3 = await prisma.comment.create({
    data: {
      message: "I am another root comment",
      userId: sally.id,
      postId: post1.id,
    },
  })
}

seed()
