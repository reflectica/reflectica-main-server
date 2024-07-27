const { summaryRef } = require('../config/connection')

const getDashboardData = async (userId) => {
  const result = await summaryRef.where("uid", '==', userId)
    .orderBy("time", 'desc')
    .get()
    .then((querySnapshot) => {
      if (querySnapshot.empty) {
        console.log('No matching documents.');
        return;
      }
      
      let additionOfMentalScore = 0
      const resultArray = []
      querySnapshot.forEach((doc) => {
        additionOfMentalScore = Number(additionOfMentalScore) + Number(doc.data().moodPercentage)
        resultArray.push(doc.data())
      });

      const overallMentalHealth = additionOfMentalScore / resultArray.length
      const prevOverall = resultArray.length > 1 ? resultArray[0].moodPercentage - resultArray[1].moodPercentage : resultArray[0].moodPercentage
      return { summaryData: resultArray, totalSessions: resultArray.length, overallMentalHealth: overallMentalHealth, prevOverall: prevOverall}
    })
    .catch((error) => {
      console.error('Error getting documents: ', error);
      console.log()
    });
  return result
}

module.exports = {
  getDashboardData
}