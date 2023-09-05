FROM node:latest

WORKDIR /home/app

ADD package.json /home/app
RUN npm install
ADD . /home/app
RUN cd /home/app/

CMD ["npm", "start"]

EXPOSE 2800
